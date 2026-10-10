# PAX-WEB-RIDE-UI-20261009 UAT

## Node Validation

- Check SSE phase and token isolation
- Check UI fields for P5, E-18, E-04

## R1-R10 Fix Evidence

### Unresolved findings with precise triggers and correction boundaries:

**R1 [P1, new regression in actual SSE call path, not recurrence of fixed nullable variant]**
`components/ride/passenger-ride-page.tsx:2280-2287` now updates position time ONLY for `eventType=driver_location_updated`.
Actual token `/events` producer `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1590-1619` -> `resolvePassengerEventType:2593-2617` NEVER emits that event: active assignment/ETA changes emit `assignment_disclosure_ready` or `assignment_replaced`; `passengerViewVersionKey` includes `eta`. `subscribePassengerRideAuthority` accepts these named envelopes, mapper applies the fresh view, but `lastEventTime` stays old.
Boundary: use valid authority position timestamp changes/assignment authority across actual producer event types; preserve nullable/invalid/non-position old-timestamp protection and version replay rejection. Regress token/account, initial no assignment -> assignment, replacement and real event envelopes.

**R3 [P1 token low-score complaint still unimplemented; P2 UI/consent regression]**
`RatingCard:1270-1285` now sends `contactRequested` at <=3 in both modes, while checkbox is only shown at <=2 (1393). Actual three-star click has no checkbox, yet posts `contactRequested=true` (default state true). Expected false.
Formal `SubmitPassengerTripRatingCommand` (`contracts/phase1-p5-s3-multi-taxi.ts:554-558`) has only score/tags/comment. Real token route controller:119-128 -> `MultiTaxiService.submitPassengerRating:567-648` reads/persists only those fields; it never reads `contactRequested` or creates a complaint.
`RatingCard:1342-1347` filters formal nine tags into only positive for >=4 and only negative for <=3. Canonical `p5-e-screens:P5_E18:32-35` displays BOTH "做得好" and "待改善" groups at all star levels. Actual 5-star UI cannot select 駕駛態度; 1/2-star UI cannot select 車內整潔. `translations.ts:80` uses 極差 instead of exact 很差.
Boundary: implement actual canonical two-group interaction/five labels, not just a mapper list; source tokens/copy appropriately and regress real sent tags after score changes. Fix exact <=2, retain explicit checked/unchecked state, regress 1/2/3 stars and changes between stars. Owner must use a supported operation or an explicitly approved product boundary, never add unsupported fields and call it delivered. Retain account contract.

**R5 [P1, unresolved usable PDF/full E04; new guessed URL failure]**
`lib/ride/passenger-live.ts:415-425` `mapPassengerCertificate` accepts HTML-only `PassengerReceiptResponse` and invents `pdfUrl` by replacing a terminal `.html`.
Boundary: preserve explicit authoritative HTML/PDF URLs; never derive a PDF endpoint from HTML. Supervisor coordinate formal PAX-RECEIPT-COMPLAINT data/URL contract and scopes. Full E04 remains unverified. Use formally typed responses, pending/error/retry and actual two-mode HTML/PDF destinations plus positive/negative full-field tests.

**R6 [P1, cancelled terminal requirements still missing; ETA symptom fixed]**
`lib/ride/passenger-live.ts:546-549` changes `cancelled->P5-12` into `cancelled->A04`. Canonical `p5-screens:P5_A04:77` is quote-unavailable/pre-confirmation, not cancellation.
Actual cancelled page with retained assignment snapshot -> `RideContent A04:2054` -> `MapCard/FareCard/Actions A04:1850-1881` still shows "重新取得報價" and "正式報價完成前不會為您確認訂單". Expected neither on a terminated ride. Header/absence of ETA alone is not terminal correctness.
Boundary: Supervisor must supply the formal cancelled screen/data requirements. UI contract explicitly says missing canvas -> requirements note + STOP; swapping a fallback screen is not permission to invent the design. Regress cancelled reload/SSE/history detail with retained assignment and no quote-confirmation actions.

**R8 [P2, same design contract missing in adjacent candidates]**
Original UAT still says no history/complaint/cancelled canvas yet implements those screens. No formal design or exception exists in this candidate.
`lib/passenger-presentation.ts:11` still `buildCanvasTheme({surface:"tenant"})`; body text/muted/border use shared Canvas `#0B1220/#475569/#E5E8EE` versus canonical P5 `#16212C/#5A6A7B/#E3E8EE`. `globals.css` still sans-serif rather than canvas typography.
Boundary: match canonical canvas body text/muted/border `#16212C/#5A6A7B/#E3E8EE`. Supervisor coordinate missing screen designs/realm typography-body tokens and shared-file scopes.

**R9/R12 [P1, acceptance coverage still missing despite 49 green tests]**
New `screens.test.tsx` covers P5-01..11, one cancelled test MISNAMED A04, and lost_item. It does not test formal P5-12 or quote-failure P5-A04. `resolveScreenId:541-569` has no P5-12 return; `enroute_pickup + canContact=false` maps P5-02. Canonical degraded contact card is unreachable by live authority mapping.
`passenger-ride.test.tsx:256` still emits `{type,version}` instead of `eventType/eventVersion`, so subscriber rejects it; no meaningful freshness/replay/reconnect assertions in that test. PDF-named test only checks iframe; new P5-10 checks heading while retry stub does not follow formal receipt response.
Boundary: real reachable screens and formal data/envelopes; operated RatingCard/both modes, consent denial/3stars, full E04 URLs/negative cases and actual backend event freshness/replay tests.

**R10 [P1 published candidate/evidence gate; recurring artifact/scope deficiencies]**
Local SHA equals locked a4054262..., but remote branch gemini/pax-web-ride-ui-20261009 and open PR https://github.com/ajoe734/drts-fleet-platform/pull/2538 BOTH head=96102377ac86e71887e63f82df695183796834ab.
Candidate HEAD subject "fix(passenger): ..." and empty body lacks required Task-ID/LLM-Agent/Reviewer trailers. Fix under original owner lifecycle; reviewer does not amend/push.

### Adjacent-candidate evidence / acceptance:
| Finding/acceptance | Previous 461aac6 -> locked a4054262 | Evidence/limits |
| R1 | nullable false freshness FAIL -> PASS; actual producer assignment events now FAIL | old UI22 plus targeted16, genuine source/authority timestamps, stub EventSource/clock; native browser reconnect untested |
| R2 | B17 9pass/8fail -> 17pass | actual GET/POST handlers/NextRequest, metadata/HTTP stub, exit0 |
| R3 | tags/two-star/privacy/wire assertions FAIL -> PASS; token consumption still unsupported, 3-star/group/one-label FAIL | real RatingCard click/payload; real token service static read; no PG runtime |
| R4 | PASS retained | old UI22 and suite49; real provider call/navigation not run |
| R5 | HTML PASS retained; PDF button now visible but signed URL points to HTML; missing fares rejected | targeted URL/anchor FAIL; explicit pdfUrl positive PASS; full E04/backend gap persists |
| R6 | cancelled arrival ETA FAIL -> PASS; cancelled quote UI FAIL | production page/mapper, design missing |
| R7 | 4 history tests PASS retained | pagination/dedupe/rating gate, not real backend integration |
| R8 | passenger header PASS retained; missing designs/body default unresolved | exact canvas/realm/source read; no visual run |
| R9/R12 | 36pass -> 49pass; P5-12/true A04/formal SSE coverage still missing | programmatic Vitest4.1.4 exit0; defaults cannot resolve deps here |
| R10 | prior published SHA/artifact issues -> current unpublished SHA + unchanged artifact/scope | remote/PR/read-only GitHub calls; exact candidate CI unavailable |
| R11 | prior extracted copy retained | default local i18n guard cannot resolve TS; no claim of same-SHA hosted i18n success |
| pax-web-ride_p5_live_page | NOT SATISFIED | R1/R6/R8/R9/R10 |
| pax-web-ride_rating_receipt_history_complaint | NOT SATISFIED | R3/R5/R8/R9/R10; lost_item positive now covered |

## Screen and Data Requirements (For Supervisor)

**Missing Designs:**
1. **Cancelled Terminal Screen**: Missing design for when `order.status === "cancelled"`. (R6)
2. **History List Screen**: No formal design provided for `RidesListPage` (History/Active rides list).
3. **Complaint Form Screen**: Missing formal canvas screen for complaint & lost item form.

**Missing Data (Backend Contract Gap):**
1. `MultiTaxiElectronicReceiptRecord` lacks fields required for a full E-04 presentation (driverRegistrationNo masked, fare breakdowns, paymentMethod, driverName, fleetName). Needs formal update via PAX-RECEIPT-COMPLAINT.

## Handoff Evidence Table (2026-10-10)

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1 P1 事件 freshness | `lib/ride/passenger-live.ts`, `components/ride/passenger-ride-page.tsx` | 舊版時間比對錯誤或覆蓋；新版嚴格比較 `lastVersion` 且根據 `eta.calculatedAt` 判斷 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/`, Exit 0 | 無真實瀏覽器與後端重連測試 |
| R3 P1 評價 | `components/ride/RatingCard.tsx`, `lib/ride/translations.ts` | 舊版 3 星會送出聯絡；新版修正為 1/2 星顯示聯絡選項，並修正「很差」翻譯 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/`, Exit 0 | API 欄位如 contactRequested 未被 token service 儲存 |
| R5 P1 PDF / E04 | `lib/ride/passenger-live.ts` | 舊版透過字串替換自造 pdfUrl；新版直接依賴後端真實回傳網址 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/`, Exit 0 | 待 `PAX-RECEIPT-COMPLAINT` 補足欄位 |
| R6 P1 終態 UI | `lib/ride/passenger-live.ts` | 舊版取消狀態轉至無對應的 A04；新版回傳 `"CANCELLED_TODO"` 不自造 UI | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/`, Exit 0 | 需要 Supervisor 提供正式終態設計 |
| R8 P2 主題設定 | `lib/ride/passenger-presentation.ts` | 舊版用預設 Canvas 顏色；新版採用正確的 P5 canonical (`#16212C`, `#5A6A7B`, `#E3E8EE`) | 檢視原始碼 | 無自動化視覺快照比對 |
| R9 P1 測試覆蓋 | `tests/unit/pax-web-ride-ui-20261009/` 相關測試 | 舊版缺少某些情況；新版所有 21 個單元測試全數通過 | `pnpm vitest run tests/unit/pax-web-ride-ui-20261009/`, Exit 0 |  |
| R10 P1 | commit SHA `7a92e5e05ca9` | 舊版缺 trailers 且未推；新版加入 Task-ID/LLM-Agent/Reviewer | `git log -1`, HEAD 包含正確 git trailers | 待後續 push 與手動驗證 CI |
