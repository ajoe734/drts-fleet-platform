# 首版營運 SA／SD 定稿提案 — 2026-09-13

狀態：root 完成具體整合方案，agy reviewer (Gemini) 已於 review-round-1.md Entry 27 完成來源核對並接受 B1–B9/C/D；待人類進行共識接受授權；尚未標記產品完成或可上線。這是本輪現行提案，文末 2026-04-11 封包保留為歷史。

使用者決策：先做到能夠上線營運；**一通電話最多一張訂單**。本對話整理 SA／SD 和審查，supervisor／auto worker 實作。下列方案沿既有服務、資料權威及驗收流程修復；來源查核基準是 `6eec9635c17674b89b8519c642eb48b51dbd6479`。

## A. 首版範圍與完成判準

- 完成既有接單 → 派遣 → 司機執行 → 帳務／稽核流程及原必要 hosted／live 驗收。多單 schema／UI、第一方乘客 App、Phase 2 自動駕駛擴充不列入首版。
- 保留現行 call/order 唯一限制、linkedOrderId 與 UI；相同請求重送回同一訂單，不同請求或人工／AI 競爭不能產生第二張。無訂單的電話仍保留其錄音。
- 現行有 18 項未完成任務，另 2 筆歷史紀錄（撤回多單、被後續版本取代的 tenant-binding 修復）不算營運 blocker。任務及狀態以 ai-status.json 為準；本封包不把驗收依賴當成獨立程式缺陷。
- 維持原單一候選的 review、CI、merge 和必要真實證據。stub、mock、provider accepted、裝置／使用者實際收到是不同證據，不能互相替代。

## B. 有限的設計決定

以下處置 [review-round-1.md](review-round-1.md) Entry 26。Entries 20–25 中相衝突的擬議欄位、表名與「已解決」宣稱，以本提案的來源校正取代；不宣稱已實作。

### B1. 打卡使用一條非同步、持久化成功路徑

沿 ShiftAttendanceService／Repository 修復，clockIn 回傳 Promise<ShiftRecord>。保留 dev 的司機停權、註銷、證照、車輛資格與重複班次防護，再等待已核准請假檢查；沿原錯誤碼，不回傳預填成功欄位。

DB 啟用時，同一 PoolClient transaction 鎖定既有 reg.phase1_registry_drivers 的 driver row，回讀 ops.phase1_driver_shifts 的當前班次，驗證後寫入當次變更並 commit，才公布成功結果／更新該筆 cache。會改變同一司機班次的 clockOut 呼叫沿同一鎖序與 transaction 寫入 shift／attendance，避免另一個 writer 繞過序列化。缺少權威 driver row 或 DB 失敗不得宣稱成功；不以整份舊 cache 回滾蓋掉其他請求。沿原 audit authority 記錄已提交操作，不在失敗請求產生成功事件。這是對受影響打卡呼叫鏈的限定修復，不重寫所有背景 persist caller。

驗收兩個並行 clockIn 僅一個成功、失敗請求無班次副作用、clockOut 後重新 clockIn、DB 失敗與重啟回讀；保留原請假及 Host/read-only/tenant 防護。

### B2. 學院資格保持單一算法與人工豁免資料

沿 AcademyService 的單一公開資格操作及既有 trainingRecord 算法，以同一課程／attempt／asOf 快照產生 records、資格和投影；使用同一 PoolClient SERIALIZABLE transaction，衝突回滾且不回成功，不另建重試框架。

非 waived 投影：有必修且全部有效通過為 passed；有必修過期為 expired；其餘不具當期有效完訓證明為 pending。空必修清單不產生完訓證明。**保留人工 waived 資料，不由 Academy 改寫**；實際 trainingRequired=true 的派遣仍按原必修條件判斷，不能用通用 soft override 放行。trainingRequired=false 沿原免要求規則。

在既有 academy-identity-decision.md §2.3 明列狹義 pending reset 授權；不改司機身分、證照、停權或人工豁免權限。evaluator、readiness 和 listRecords 使用同一公開操作；實際指派重新驗資格，C115 過期投影也呼叫同一權威。

### B3. WIRE 啟動與完整驗收

沿既有 wire-acceptance.yml，讓 apps/api 的 tsx 啟動明確使用根目錄 tsconfig.base.json，避免把 dist/index.d.ts 當執行期模組。保留 package exports；不加 require-cache 修補或第二份 tsconfig。先非服務型檢查 contracts 常數及 auth function，再於 hosted workflow 驗同 SHA 的完整 API／SQL 5 項及 browser 5 項，0 skipped。

### B4. 證照／保險到期沿 Registry 權威補做積壓

沿單一 reconcileExpiredCredentials 操作和原 Registry repository；掃描 PostgreSQL 的已到期未處理資料，不依賴「即將到期」查詢或只有 last-tick 時窗。每批固定 asOf、穩定分頁、有限批量。Academy 到期另透過 B2 同一算法。

來源為 reg.phase1_registry_drivers 三個既有 expiry 欄位，以及 reg.phase1_registry_policies 的 policy JSON／車輛關聯。driver 原有效性規則為有效日期 <= asOf 即過期；policy 原 applyPolicyLifecycle 使用 endAt < asOf 並優先考慮 cancelled／startAt。沿這些差異，不自行統一成新日期政策。

擬新增 Registry 專用到期處理紀錄（forward migration；表名／檔號由既有 schema allocation 指定），保存原來源引用、狀態、attempt、runAfter、lease 與通知交付引用。來源 fingerprint 用 SHA-256 對 UTF-8 JSON 固定序列編碼：driver 為 ["credential-expiry/v1", scope, "driver", driverId, sourceFieldName, Date.parse(expiry)]；policy 為 ["credential-expiry/v1", scope, "policy", policyId, vehicleId, policyNo, insuranceType, Date.parse(startAt), Date.parse(endAt), status]。不納入 updated_at 或衍生 lifecycleStatus；無有效日期的資料沿原驗證處置，不猜日期或建立假到期事件。

driver／policy 更新與 expiry 處理使用同一來源 row 鎖；來源鎖在事件 row 鎖之前，多筆時依固定 ID 次序。取得鎖後重讀來源 fingerprint，再以唯一 key 建立／更新事件與 immutable 通知交付意圖。續證已生效則舊事件 superseded；不永久蓋寫原 licensesValid。通知送出前重查現行來源；若續證與外部 send 恰好重疊，保留已送出的事實與 superseded 關係，不能保證外部收件者永遠看不到剛失效的提醒，也不能刪除 send 回執。

### B5. 通知沿原 MailOutbox 契約持久交付

沿 NotificationDeliveryService、MailOutbox、MailTransport。Cloud Run 的正式 outbox 使用符合既有 transaction(callback) 契約的 PostgreSQL adapter；這是待實作／待配置的新 adapter 和 forward migration，**不是現有已部署資料表**。只選一個 production binding，沿原 delivery service 的 retry／lease／payloadHash／receipt，不新增投遞框架。

Registry 在 domain transaction 留下 immutable recipient、from、subject、body、tenant、eventId、idempotencyKey 的交付意圖。以固定序列 ["credential-alert/v1", scope, eventId, recipientEmail] 形成 key；重試一律使用同一內容／key。domain commit 後呼叫既有 enqueue：enqueue 前停機則由意圖補交；enqueue 後、保存 deliveryId 前停機則重送同一 request 取回同一 receipt。不同內容撞同一 key 沿既有 conflict 拒絕，不重建內容或吞掉錯誤。

既有 MailTransport 只有 send；不新增未經證明的 provider query／exactly-once 保證。沿原 uncertain attempt 表達外部結果未知，重試風險與實際 provider 去重能力由 live 證據說明。接受回執與使用者實際收到分開；晚到的 provider acceptance 保留於原 attempt，不因續證／lease 更換刪除或回復過期事件。

### B6. 錄音接回同一 voice queue，保留 booking 工作

重用 VoiceCommandRunnerService、voice.work_item、VoiceSessionRepository.withTransaction 與 media domain 的 FinalRecordingManifests。資料列實際使用 work_id／lease_epoch／leased_until／status=leased；不為配合審查假欄位建立第二份 repository 或 lease schema。

可信 AI close event 的 voice.session_event 追加、session CAS、finalize enqueue 使用同一 transaction。一般電話沿 crm.phase1_call_sessions 持久入口與相同 work queue，不偽造 voice.session 或 intent。相同 source event／dedupe key 重送要回讀並核對 payload、scope、call／recording／版本；不得因 already closed 或 ON CONFLICT DO NOTHING 提早忽略差異。恢復掃描也補入歷史 recording-pending session；不以新 close 才能排入。

media adapter 依可信 closure ledger、immutable segment／object 版本封存及驗證。外部封存可重入且引用固定；取得結果後，在既有 runner 的完成 transaction 先檢查 work lease，再寫入正確 call／唯一訂單的錄音狀態與 durable receipt，最後 completed。失去 lease 的結果不能改 domain state；不得由 handler 和 runner 各做一條互相衝突的 completion。最終音訊失敗保留前段 checkpoint／訂單確認證據。人工／AI、零／一張訂單、跨 tenant、歷史待補與重送都要驗。

部署使用同一個既有 loop，保留 execute_booking_command 的已接受處理路徑；finalize_recording 只有在真 handler 接好才啟用。其餘 type 需具備原 domain adapter 和持久成功條件才可領取；未知／stub 不得無操作 completed。特別驗證 booking command 已完成／重送時不造成 generic completion 的第二次衝突。boot 在 DB／adapter 初始化後啟動，shutdown 沿既有 drain；逾時不提早釋放仍可能有副作用的 work lease，靠原 leased_until 恢復。部署所需持續 CPU／warm instance 在 shared dev 驗證，不在 VM 跑產品。

### B7. failed work 補跑是同一列的受控修復

ON CONFLICT DO NOTHING 不會恢復 failed work。沿現有 voice domain 增補 ops 授權補跑：同一 transaction 核對 scope、work_id、目前 failed 與 expected lease_epoch，追加 durable repair audit，原列改 pending、排入新一輪有限 maxAttempts 預算。保留 work ID、payload、既有 receipt；leased／completed 不可走此操作。

同一 forward migration 提供該 voice work 的追加式 attempt／repair 紀錄（不是新 queue）：保存每次新 attempt 結果及補跑 actor/reason/requestId，對 repair request 去重。現有舊資料只有 attempt 數及 last_error，補跑前保存這些可取得證據，不能宣稱已恢復不存在的完整舊歷程。每輪 attempt 重設只在該 audited repair transaction 發生；無限自動重置不允許。

### B8. C113–C115 沿既有 hosted runner 驗證

擴充 tenant-uat-acceptance.yml 的獨立驗收階段；原 tenant HTTP／spec／unit／restart gates 保持。C111/C112 沿已有 tenant-binding／transport 路徑。C113 使用真 API／PostgreSQL 驗來源 mapping、auth、resend、防重與對帳結果；只改 issue status 不能當調帳完成。C114 使用已配置 provider 的 timeout／error，驗原 typed error、重試／降級與對外結果。C115 停止產品行程、保留同一 DB／物件資料，啟動新行程，驗 recording／expiry／alert catch-up、競爭、續證、DB 失敗、租約和回執。dispatch timeout 不是 C115 的替代。

測試失敗若顯示新產品缺陷，交回既有 parent 的具來源修正範圍，不把實作藏在 harness。所有 serving／DB／browser 驗收都在 hosted/shared dev。

### B9. 入口與外部接收端

SR-LIVE-ENTRY 對照已接受的 realm/auth matrix，分別驗部署 probe 與正常使用者登入；403 要查實際 IAM／route／identity，不能一律改成公開或只替 CI 加身分就算使用者可用。

Q-SR-PUSH-001 只缺既有接收產品／服務及 passenger subject-to-device 契約；通用持久化 child 已完成。首版沒有第一方乘客 App，不為此開發新 App，也不以司機 device binding 代替乘客。實際既有接收端名稱／決策位置仍待使用者提供；未提供前不挑 FCM/APNs 或刪掉原 C023/N10/live gate。

## C. supervisor 派工範圍與順序提案

使用者確認後已透過既有 task commands 登記範圍／依賴，派可用 agy 實作、Codex review。WIRE 已恢復；新增 SR-LAUNCH-SCHEMA-20260913、SR-RECORDING-RECOVERY-20260913、SR-CREDENTIAL-EXPIRY-20260913、SR-C115-HARNESS-20260913。這是原修復工作拆分，沒有新增產品流程；狀態以 ai-status.json 為準。下表為已接受的 scope 邊界，精確檔案範圍已放入任務紀錄。

| 原任務／必要修正 slice | 寫入範圍 | 次序／完成證據 |
| --- | --- | --- |
| SR-WIRE-001：B1–B3 | 原 WIRE scopes，加 shift-attendance.repository.ts、driver-academy 的 service/repository、既有 academy-identity-decision.md 和相應回歸測試；必要 schema 約束沿既有 allocation | 優先恢復原 guards、async DB 邊界、Academy 及 tsx 啟動；同 SHA 完整 5+5 hosted 驗收 |
| SR-QA-WEBHOOK-001 下的錄音產品整合 slice：B6–B7 | voice-booking 的 runner/session/evidence/module、callcenter 的受影響 close／recording service/repository/module、既有 voice-media-worker recording adapter、專用 forward migration、其非服務型測試 | 與 WIRE 在無重疊檔案下平行；先註冊產品修正 child/scopes，再由 QA 驗，不能給 QA 無限產品寫入權 |
| SR-QA-WEBHOOK-001 下的 Registry/通知整合 slice：B4–B5 | regulatory-registry service/repository/module、notification-delivery adapter/module、專用 forward migration、原 ops/platform alert read surface 的必要接線及對應測試 | 依賴 B2 公開資格操作及原 schema allocation；共用 Registry／module 的 writer 由 supervisor 序列化。錄音和通知 adapter 寫入互不重複 |
| SR-QA-WEBHOOK-001：B8 | 原 tests 與 runbook、tenant-uat-acceptance.yml 及其既有 workflow verifier；撤下不存在的 webhook-uat-acceptance.yml 寫入目標 | harness 可與產品修正平行準備，最終驗收依賴整合候選；保持三個原 parent acceptance keys |
| SR-LIVE-ENTRY-001：B9 | 先唯讀 realm/route/IAM/probe 查核；確定缺陷後在原部署／入口任務授權精確修改 | 不受 P05 接收端問題阻止唯讀查核；不改匿名曝光政策，不在 VM 部署 |
| SR-PUSH-001、後续 booking/newfeatures/release/live/UV/acceptance | 保留原任務、既有 provider-neutral 修復及依賴 | P05 接收契約定案後接真 transport；必要真實 provider、PSTN、裝置、文件、對帳與小量營運／回退證據仍須完成 |

migration 名稱及共享 contract allocation 由既有 schema owner 在派工時核對，不能各 worker 猜同一檔號。先確認已發布 UV/adapter 候選是否可直接組裝，只修實際差異，刪除被取代的受影響死路徑，不刪其他未提交 WIP。

## D. 仍須取得的結果

1. agy reviewer (Gemini) 已於 review-round-1.md Entry 27 完成來源核對並接受 B1–B9 與 Entry 26 的處置；待由本對話人類確認並授權接受本輪共識封包，不能沿用 April 的接受紀錄。
2. 實作／review／hosted／live 證據尚未產出，不宣稱已達可上線營運。P05 與真實服務驗收資料各留具體 blocker，不阻止獨立修復／查核。
3. 本輪 SA／SD 公開推送遭 automatic approval review 拒絕，正在詢問使用者本次文件公開授權。文件可本機審查及 anchor；不得以另一個 worker／PR 繞過。SA／SD 接受後的 supervisor／auto-worker 執行已有使用者指示，不再重問相同執行授權。

---

## Historical packet — 2026-04-11

# Phase 1 Consensus Packet

> Historical consensus packet note (2026-09-13): This packet records the 2026-04-11 convergence. It is preserved as historical evidence and does not authorize execution for the reopened 2026-09-13 planning cycle. Active pre-implementation discussion proceeds in `review-round-1.md` and `product-remediation-sa-sd-20260913.md` under `discussion_planning`. Promotion to an updated consensus packet occurs only after cross-lane convergence and human acceptance.

## Metadata

- Date: 2026-04-11
- Editor: Codex synthesis from Qwen, Gemini, Copilot, and Claude readouts
- Based on rounds: lane readouts + review round 1

## 1. Accepted Conclusions

- Phase 1 is a fleet-management + dispatch-compliance core that must be independently operable and auditable; Phase 2 autonomy/Tesla/FSD/ODD work remains extension-only and must not reshape Phase 1 flows.
- `owned` and `forwarded` are separate domains with separate lifecycle, assignment, settlement, and API semantics. Forwarded flows never enter owned dispatch assignment.
- Formal Phase 1 service buckets are only `standard_taxi` and `business_dispatch`. `business_dispatch` is limited to `enterprise_dispatch` and `credit_card_airport_transfer`.
- Canonical enums are frozen for Phase 1 and must stay serialized in canonical `snake_case` across APIs, callbacks, reports, and artifacts.
- Audit, dispatch trace, complaint timeline, and delivery histories are append-only governance artifacts. Complaint, incident, notification, and audit are separate lifecycles.
- APIs stay command-first, idempotent, and envelope-stable. Driver App and web UIs send commands rather than directly patching canonical state.
- Regulatory eligibility is a hard dispatch gate. Vehicle/driver compliance data is authoritative input to dispatch decisions, not a UI hint.
- SQL migrations are the schema authority. Prisma may assist implementation but must not override migration truth.
- The accepted execution wave order is: foundation/governance -> regulatory -> owned order/dispatch/driver-task -> callcenter/complaint/CTI -> billing/settlement -> reporting/filing -> forwarder.
- Execution must re-enter `discussion_planning` whenever a slice proposes enum expansion, lifecycle changes, source-of-truth ownership changes, retention-policy changes, or forwarded/owned seam changes.

## 2. Rejected Interpretations

- Reject any interpretation that lets `forwarded` orders reuse owned assignment endpoints or become owned dispatch truth.
- Reject any interpretation that treats Phase 2 AV/Tesla/FSD/ODD runtime work as a prerequisite for Phase 1 launch.
- Reject any interpretation that expands Phase 1 product buckets or `business_dispatch` subtypes without explicit human approval.
- Reject any implementation style that relies on giant PATCH-style status mutation instead of command-first APIs with idempotency.
- Reject any design that merges complaint lifecycle into incident, notification, or audit, or that overwrites append-only operational trace history.

## 3. Unresolved Human Decisions

- `call_session` to `order` cardinality and the canonical CTI correlation model.
- CTI recording retention/source-of-record capabilities and how far Phase 1 controls raw recording storage versus indexed metadata.
- Final notification/webhook/audit persistence shape where the migration plan and extracted DB bundle still diverge.
- Whether forwarder belongs inside Phase 1 GA or remains a later rollout after owned-core stabilization.
- Missing `phase1_system_design_v1.md` boundaries that would normally arbitrate deeper runtime/service split questions.
- Passenger app launch timing relative to owned-order cutover.

## 4. Execution Waves

- Wave 0: foundation, identity, audit, notification, webhook governance, and control-plane discipline.
- Wave 1: regulatory registry, vehicle/driver/contract/insurance/exclusivity readiness, and dispatch eligibility.
- Wave 2: owned order + dispatch + driver-task core for `standard_taxi` and `business_dispatch`, including redispatch and proof gates.
- Wave 3: callcenter + CTI correlation + complaint lifecycle.
- Wave 4: billing + settlement, including statements, reimbursements, and payout semantics.
- Wave 5: reporting + filing + signed artifact/download policy.
- Wave 6: forwarder mirror + reconciliation after owned core is stable.
- Current repo status: foundation governance and the first owned mobility baseline slices already exist, but persistence-backed migrations and later waves remain incomplete.

## 5. Task Ownership / Reviewer Map

- `Codex`: contracts, schema, state machines, acceptance tests, and canonical execution slices that touch cross-domain invariants.
- `Qwen`: API seams, callcenter/CTI adapters, complaint and integration-facing vertical slices.
- `Gemini`: migrations, runtime/infra, rollout safety, persistence packs, CI smoke paths, and reporting/billing implementation risk.
- `Copilot`: contradiction scan, test-gap review, roadmap drift detection, and second-pass critique of execution slices.
- `Claude`: governance review, baton control, consensus arbitration, and execution-to-discussion re-entry decisions.
- Near-term execution backlog after this consensus:
- `W1-003A` regulatory persistence and compliance gate hardening
- `W2-002B` persistence-backed owned order/dispatch repositories and migration alignment
- `W3-001A` callcenter + CTI correlation baseline
- `W3-001B` complaint case lifecycle baseline
