# PAX-BUREAU-GUIDE-CURRENT-EVIDENCE-20261019

Owner: Codex2. Reviewer: Root Codex. Base: `61fa7cf44fb25d8be36634357fa3549286b96b84`.

## Result and source scope

The guide previously displayed only the historical `.4` / `48d94` results next
to the current Passenger entry. It now presents a separate, dated record of the
two completed shared core/additional suites. Their source SHA identifies the
evidence, not the code currently serving the guide. The historical 163-stage
summary, all 16 detailed cases and every original missing item remain unchanged
in `components/bureau-review/content.ts`.

Only the five allocated files change: `shared-run.ts`, `BureauReviewPage.tsx`,
`translations.ts`, the existing `bureau-review-page.test.tsx`, and this document.
The route's `force-dynamic`, public relative links, private-host mode and Driver
control boundaries are unchanged. The frozen Entry/Parent candidates, their
original authorship and acceptance keys are not reopened or replaced.

## Evidence and limits

The fixed metadata references deploy run [39187969683](https://github.com/ajoe734/drts-fleet-platform/actions/runs/39187969683),
source `61fa7cf44fb25d8be36634357fa3549286b96b84`:

| Artifact                           | SHA-256                                                            | Qualified scope                                             |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `12159932019`, shared core         | `811c3c323aede0aecb4fbed1849ec8f7f1dfd06fa72d7ead3da4c9ab58833ef0` | 3 new orders, 48 stages; one test passed, retry 0           |
| `12159612755`, additional branches | `c81bd40a3e8cc97ff7f1f82aabce89fa6b7756fe1271d1882a1202058a731da7` | 5 different new orders, 60 stages; one test passed, retry 0 |

Both ZIP digests match GitHub metadata, CRC checks pass, and each report's
`config.metadata.gitCommit` and `ci` bind the full source SHA. This is 8 original
orders / 108 stages, not all PAX UC01–16 or the separate 16 operational tests.
It does not report the later quote/timeout/recovery steps or whole workflow as
complete.

The finite qualification is preserved at:

- `.local/passenger-bureau-gap-correction-20261018/parallel-readonly-audit-20261019/shared61fa-core-additional/qualification.json`, SHA-256 `b1b69c52ff6d9a4eee2a80aa6bb2cc55234838f0140292e0e07bd2463dd04156`.
- `.local/passenger-bureau-gap-correction-20261018/direct-dev-entry-simplification-20261018/Root-independent-live61fa-actual-image-readback.json`, SHA-256 `7bc9b89f140bd4fdc82cc98051b5a7010ec45263510912a976bf0facc0c1d3e0`.

These machine-specific paths are review evidence; the rendered Passenger page
does not expose them or any token/session material.

| Finding / requirement                 | Delivered page behavior                                                                                                                          | Evidence boundary retained                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| First activation                      | Real ordinary OTP 201, consent prompt presented, returning account false, same-account terms/privacy saved                                       | No consent-window screenshot; unchecked/refusal/wrong/expired/resend/session negatives remain open                       |
| Fare/cancellation                     | A/B/E TWD85; B same-payment attempt 1 failed → attempt 2 captured; C/D/F/G/H cancelled without charge/payment/rating                             | Allowed cancellation is free; refund needs actual prior capture. No on-trip/proof-pending UI rejection or real PSP claim |
| Timeout applicability                 | 90s matching-job threshold and 60s assigned-offer deadline explained independently                                                               | No added instant Passenger product or claim that the two suites execute the 90s matching branch                          |
| Recovery/maps/driver                  | Same-order reassignment; F actual Google search/reverse/service-area recovery; H simulated GPS stale/fresh; G original Driver refusal            | Missing driver data, map faults, lost ACK, reload/cross-device and Driver B screen remain unverified                     |
| Documents/complaints/special services | Four nonformal HTML including two complete synthetic E04; same-order lost-item internal lifecycle; contact-consent and immutable-rating branches | Formal issuance, pending/retry, fare/service complaints, real contact/return, welfare/accessibility remain open          |
| Terminal/contact presentation         | A completed tracking ended; C/G original terminal headers/footer; D single independent contact-phone notice and account link                     | C/G tracking cards and A full order UUID outside image crop; D notice is before the D order exists                       |

Supply qualifications, GPS, PSP, SMS delivery and notifications remain explicitly
simulated external sources. Internal order/auth/fare/dispatch/payment/case paths
are real application flows. The existing shared artifacts use deployed API
repository readback; formal PG joins belong to their separate same-source CI
qualification, not a new direct Cloud Run SQL execution by this task.

## Validation and acceptance

The two new DOM checks fail on the unchanged base page: 2 failed / 7 passed,
exit 1, because no separate current-evidence region exists. The seven existing
checks, strengthened to inspect every historical case field and ordered step,
pass on that base. Raw output:
`.local/passenger-bureau-gap-correction-20261018/guide-current-evidence-20261019/page-before.log`.

Post-change checks:

| Command / check                                                                                                               | Actual result                                                                                          | Raw log in the task's `.local/passenger-bureau-gap-correction-20261018/guide-current-evidence-20261019/` directory |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/pax-bureau-browser-entry-20261018/bureau-review-page.test.tsx`                               | Exit 0, 9/9 passed; repeated after simplifying the visible login wording, still 9/9                    | `page-after.log`, `page-final.log`                                                                                 |
| Scoped `pnpm exec eslint --max-warnings=0` on the four changed TS/TSX files                                                   | Exit 0                                                                                                 | `scoped-eslint-final.log`                                                                                          |
| Scoped ESLint after simplifying visible login wording                                                                         | Exit 0                                                                                                 | `copy-eslint-final.log`                                                                                            |
| `node tools/ci/i18n-guard.mjs`                                                                                                | Exit 0, 683 files / 81 existing exemptions; no new exemption                                           | `i18n-guard.log`                                                                                                   |
| `git diff --exit-code 61fa7cf44fb25d8be36634357fa3549286b96b84 -- apps/passenger-app-web/components/bureau-review/content.ts` | Exit 0; historical file SHA-256 `5ff1320b7350042fb340cfbe215781e00de1b5f147aefc5ed5105dbf1bf108ba`     | Exact base blob comparison                                                                                         |
| `pnpm --filter @drts/passenger-app-web typecheck`                                                                             | `next typegen` passed; first `tsc` exited 2 on four unchanged contracts files missing `zod` resolution | `passenger-typecheck.log`                                                                                          |

The final full `pnpm --filter @drts/passenger-app-web typecheck` exited 0:
`next typegen` and `tsc --noEmit` both passed. Its separate raw output is
`passenger-typecheck-final.log` in the same task evidence directory.

The original typecheck failure is preserved, not labelled a pass. Root then
reused the accepted package-local contracts dependencies via an ignored,
read-only symlink after verifying identical package manifests (SHA-256
`97a356560520c3a424be18162291bf1aa6bf8c53c749fc6db45170d49a35f405`).
The receipt is `normal-own-contracts-dependency-resolution-reuse.json` in the
same task evidence directory. No installation, shared distribution build or
product change was needed. The successful full typecheck ran in the serialized
check window after the active Journey app typecheck ended.

Checkpoint `227c7e476d4862613e86f60eddbb3d04e9b5170a` was an ordinary commit
without `--no-verify` or a hook-skip environment variable. Its own new worktree
initially lacked the ignored Husky bootstrap, so that checkpoint did not run
hooks. The canonical generated-file range guard and commit-trailer range guard
were then run explicitly and both exited 0 (`generated-file-range.log` and
`commit-trailers-range.log`). Root restored the identical accepted bootstrap as
an ignored directory without changing tracked hooks or configuration. The
finalizing commit uses these normal hooks; the original checkpoint remains in
history without amendment.

No VM product, HTTP/browser/PG/Compose server was started. Own required hosted
CI and the assigned independent review must still validate the final candidate.

| Required acceptance                                            | Evidence / outstanding work                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pax_bureau_guide_current_evidence_historical_cases_preserved` | Historical byte identity and real page DOM/content checks required; the page separates 108 from 163 and keeps both positive evidence and remaining limits                   |
| `pax_bureau_guide_own_candidate_review_ci_merge`               | Own normal commit/plain push/full candidate/PR, assigned independent review, own required CI and protected merge remain required; predecessor green checks are not credited |

This document is source validation for a guide update. Deployment of the new
guide and any new shared-runtime claim remain Root's separate release work.

## Current16 Guide followup WIP — exact technical limits retained

Root normally reopened the SAME Guide task and coordinated only the original
Journey UAT as its sixth Source scope. The original two Source-only keys and
historical acceptances remain; the accepted functional Journey is not reopened.
The current16 public copy uses reader language, with all83 operating steps and
per-case expected/evidence/missing fields separate from the frozen historical16
cases/75 steps/163 stages in `content.ts`.

These are the precise internal limits behind the public wording; none is removed
or treated as a new runtime gate:

- Formal E04 issuer, historical operator, settled-payment binding, total/toll
  authority and the existing `PAX-RECEIPT-E04-CAPTURE-20261015` conditions remain
  unresolved where originally unresolved. Existing USER unanswered conditions
  stay unanswered; this Guide does not answer them or add USER questions.
- Unknown COMMIT evidence remains scoped to the original booking/receipt paths,
  not every audit/outbox/notification delivery. Original3s lock timeout under
  prolonged contention may require retry with the same idempotency key and
  original command identity; no rebase to a new intent is implied by public
  “retry the original request” wording.
- PSP is simulated. Real authorization, settlement, refunds, multiple workers
  and duplicate callbacks still require their original applicable verification;
  no real-money success is inferred from synthetic attempts.
- UC16's seven-product/capability Source mapping is specification evidence only:
  seed/catalog/license/active flags and ordinary synthetic vehicles do not prove
  qualified equipment, actual wheelchair supply or successful human referral.
  Welfare identity/region/fare authority and the full applicable journey remain.
- UC15's61fa lost-item five historical action receipts are distinct from the new
  fare/service cases: each has four subsequent action receipts and exactly five
  timeline entries including creation. Human contact/recording/physical return
  is not established by internal closure.

The preceding technical limits remain current. The initial pre-readback draft
did not claim runtime success; actualR evidence and all16 case qualifications
are now recorded below. HostedN remains a separate evidence source. Guide Source
validation, its own candidate/CI and review are not supplied by that runtime run.

## 4cf8 同版共享原物採認與完整16案回填（Guide followup）

本段沿同一 Guide task 的六個正常 scopes 更新資料，不改 accepted Journey 功能或其角色／兩keys。
原歷史16案／75步／163階段及61fa兩測試／8張新訂單／48+60=108階段完整保留。
目前公開程序為16案／83步，每案的情境、前提、步驟、預期、已驗及缺漏都保留；A/B/C等為演練情境代碼，跨版本同字母不是同一訂單，各取消情境亦各用獨立訂單。八個測試不能改寫成八張新訂單，亦不代表全部16案完整通過。

| 證據來源                                                                                | 真實結果與界線                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| own hosted definition N=`2fd89764be352843bfa545158a7083add5197029`                      | 五個自身CI SUCCESS；integration39225527925原bureau8PASS／0skip／0retry、25facts／36PNG，artifact12176230958。actual checkout93bd948e…與N的tree相同，各job自己的raw marker獨立綁定。這是隔離CI，不換成共享結果。                                                                                                                      |
| authorized deployment39229683109 / runtime R=`4cf8eadadb4e74e736c1c5f88286645e0fa84aa0` | 18個job成功、1個operational job失敗；11images均從R建置，migration成功，10services原日誌各100%traffic且health通過。Fleet setup四案401 JWT_INVALID，使原operational16案為12PASS／4FAIL，原Passenger core／additional／quote／60秒／decline五流程未執行；空artifact upload是後續失敗，不能掩蓋原Fleet contract或稱整deploy成功。        |
| independent shared dispatch39233244101 / job117996060055                                | frozen definition N、runtime R，原shared artifact12179385626 ZIP SHA256=`8f2941d1f25a0953a9c1237aeaa75a4f427da80f2398d7e8b9db410458a91074`，CRC正常；8PASS／0fail／0skip／0retry、26JSONfacts／33原PNG。不是同run隔離ui-bureau的結果。                                                                                               |
| runtime binding                                                                         | before／after API `drts-dev-api-00123-8p7`、Ops `drts-dev-ops-console-web-00117-ssf`、Passenger `drts-dev-passenger-app-web-00055-r9c`完全相同且全R；servedPassenger／Ops／privateDriver皆200及R。PublicPassenger沒有GCPcredential，privateOps／Driver沿Ops audience既有身分。                                                       |
| actual waits and invariants                                                             | matching原90000ms政策，103723ms實際觀察background timeout；OTP過期測試總時長302645ms；原程式真wait301000ms，保留原60秒cooldown；三角色offline67015ms。on_trip disabled＋同乘客session409 ORDER_NOT_CANCELABLE，原order/task/assignment/payment/charge不變，再正常Driver完程。                                                        |
| actual aftercare                                                                        | 原order `ee97f5b5-83d2-4964-b70d-66d4bc6fcd93`／task `aee75c2c-d498-4ad5-8bbf-60c132950556`；fare `PAX-e15afa02-da97-458d-b361-661839c8c559`與service `PAX-ef1d9ab8-f0fa-48d8-8ec1-f2b35edaf2ae`各四completed receipts／audit UUID及精確五timeline，humanContactExecuted=false。原主ride／Driver終態及lostACK中性copy已實際看原PNG。 |
| explicit unexecuted                                                                     | UC08共享沒有正常發布不完整disclosure資料的操作；UC09共享沒有外部Google fetch替換控制。兩份executed:false原facts保留；不可借隔離fixture/fault正向當共享驗證。                                                                                                                                                                         |
| whole manual workflow                                                                   | 停止冗餘本地watch的最後原snapshot10:14:42 UTC為20success／2skip／2inprogress（隔離ui-bureau與core/additional）；只採已完成shared job，未把當時尚未完成的全workflow標綠。Root後續終態若有補證另記，不重派或取消GitHub run。                                                                                                           |

原始機器證據在 `.local/passenger-bureau-gap-correction-20261018/journey-normal-fallback-20261019/source-checks/hosted-shared-bureau-39233244101/`。
`shared-runtime-actual-readback.json` SHA256=`fc65378a4e7a766401a9dd49d7653c5c0895d36169ca572a3347b6bff4722d05`；Root獨立親讀原ZIP、全部26facts／33PNG及7張關鍵原圖的report SHA256=`2997b86e4b7cd90f1b62629e00674205d506d775d40fa78ad928ded277bea81d`。
原文件中的各輪失敗／hook／consumer退修、provider限額、外部USER未答、formal E04、真車供給等歷史不改寫。

| 案例                            | 本版已驗／各自來源                                                                                                                                                                                                                                         | 仍缺或本輪未執行                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC01 首次使用與正常預約搭乘     | 4cf8共享實跑確認首次勾選門檻、拒絕後登出且讀帳戶回401、五次錯碼鎖定、原60秒重送、真實等301秒後的過期拒絕與重取恢復，以及同帳戶有效同意回訪；同版原單正常完程、付款與五星也已核對。2fd897隔離驗證另存。                                                     | 自然登入期限到期及舊條款／隱私版本過期後重新同意仍缺。圖片只證明實際拍到的狀態，其他狀態依操作紀錄核對；真實簡訊送達及正式條款採認另驗。                                           |
| UC02 回訪登入付款方式與歷史恢復 | 4cf8共享實跑確認兩張本人付款方式、唯一預設切換、放棄刪除不送請求、使用中的卡片刪除被拒及取消後刪除；另一瀏覽器登入後恢復同帳戶與同一原單，改用其他帳戶不能取用原請求。                                                                                     | 另一瀏覽器不等於兩支實體手機；真實簡訊、真實支付服務及自然登入到期後恢復仍缺。綁卡前的選址圖不能當作兩張卡與預設切換的原圖。                                                       |
| UC03 費用告知與未勾選確認       | 4cf8共享實跑確認草稿重載、重新報價後清除舊費用確認、未勾不能叫車、重新選本人付款方式，以及新確認後以同一原請求恢復唯一訂單。                                                                                                                               | 正式營運費用與條款文案採認仍待，不以演練文字代替。                                                                                                                                 |
| UC04 預約時間錯誤與報價過期     | 4cf8共享實跑確認合法午夜草稿保存／重載與重新報價。2fd897的獨立隔離驗證另真等15分鐘報價到期後恢復；這不是本次共享八測試的內容。                                                                                                                             | 本版共享的完整15分鐘報價到期流程尚未執行；完整跨裝置／跨時區及正式提前時間規則組合仍未全部覆蓋。                                                                                   |
| UC05 各階段取消與取消確認       | 4cf8共享原單行程中取消鍵確實停用，同乘客身分直接取消回409 ORDER_NOT_CANCELABLE，原訂單／任務／指派／付款不變；之後同單正常完程。其他本次原單在允許的上車前階段正常取消，沒有強制改狀態或行程扣款。61fa接受前／後與抵達後放棄及確認取消仍保留為舊共享證據。 | 本次未重跑全部接受前／後、抵達後取消確認組合。允許取消時不收取消費；退款僅適用已實際扣款。待補憑證仍缺可達拍照及上傳入口，不可塞假憑證或改任務狀態。                               |
| UC06 無車拒接接單逾時與拒派恢復 | 4cf8共享沿既有一般即時訂單流程真等90秒媒合政策與背景排程，實際103723毫秒讀到逾時，再沿同一原單恢復、接單及正常取消。2fd897另有60秒接單逾時與拒派恢復的獨立隔離通過紀錄；乘客預約入口沒有新增即時服務選項。                                                 | 本次共享未執行60秒接單逾時及拒派409恢復。有候選但未指派不等於無供給；合成供給控制不證明真實市場或真人接送。                                                                        |
| UC07 改派後重新核對司機與車牌   | 4cf8共享原單舊司機任務取消、新司機接受／前往／抵達／開始，離線重連後同單正常完程；乘客、新舊司機與調度關係讀回及主頁完成／追蹤結束原圖均已保存。                                                                                                           | 真人實車、實體證照及現場上車核對仍缺，合成車牌不能代替。                                                                                                                           |
| UC08 司機資料不足與聯絡不可用   | 2fd897隔離驗證確認必要車色缺漏時拒絕指派、原單沒有指派司機。本次4cf8共享沒有正常發布不完整揭露資料的操作，已明記該分支未執行。61fa聯絡不可用提示、客服及重試仍屬舊共享證據，未表示真人通話成功。                                                           | 本版共享缺資料情境未執行；其餘必要欄位、司機資料缺漏與聯絡故障組合仍缺。登入及聯絡手機獨立，未要求SMS聯絡驗證不得冒作阻擋預約。真人通話及真資格資料仍待。                          |
| UC09 定位拒絕超區地址與圖資故障 | 4cf8共享沿固定演練地點走真報價、草稿及建單；本次沒有替換Google外部來源，受控故障分支明記未執行。2fd897隔離另通過圖資斷線／逾時／零候選、消歧與恢復；61fa真Google反查／搜尋／路線及超區恢復仍是舊共享證據。                                                 | 本版共享受控外部供應商故障及一般Google選址全流程未在本次八測試重跑；不能把隔離受控故障當共享Google實際故障。實體GNSS、原生底圖、道路導航未驗，恢復圖不能代替每張故障圖。           |
| UC10 位置延遲離線與重連         | 4cf8共享三端真離線67015毫秒後恢復原單／任務／指派／金流。真建單已完成但瀏覽器遺失回應後，重載及另一瀏覽器仍沿原請求取得同一訂單；改內容回409、其他帳戶不能取用。原圖顯示「目前沒有可顯示的地圖資料」與同請求重試，沒有聲稱已取得司機位置。                 | 數小時長離線、手機系統關閉應用程式或終止背景運作仍缺。處理結果不明時應沿原請求重試；其他稽核紀錄及通知是否送達須另驗。                                                             |
| UC11 扣款失敗欠款拒約與補繳     | 4cf8共享本次正常完程單的演練付款為85元，沒有另執行B付款失敗與補繳。61fa B沿同一付款紀錄由第1次失敗至第2次成功、欠款拒約及補繳保留；2fd897原核心與加驗的隔離通過紀錄亦另列。                                                                                | 本版共享B付款失敗／補繳的原頁面與同一付款讀回尚未執行。真卡授權、清算、退款、重複付款通知及多個處理程序同時執行仍須另驗，不把模擬支付當正式通過。                                  |
| UC12 乘車文件下載與未就緒恢復   | 4cf8共享未完程原單顯示文件準備中，斷線失敗後有重試，恢復仍為未就緒；正常完程後同一原單文件恢復，付款與不可變快照讀回一致。                                                                                                                                 | 正式E04開立業者、行程當時所屬業者、已結清付款連結、總額及通行費規格仍待確認。圖上PDF／HTML按鈕不等於已查驗下載檔內容，合成文件不能當正式開立。                                     |
| UC13 高分評價與送出後不可修改   | 4cf8共享原完程單五星後以1星及4星重送均回409；重整隱藏評價入口，原五星及不要求聯絡保持。61fa E兩星及拒絕改分仍是舊共享證據。                                                                                                                                | 其他合法星等、標籤、留言及快速重送組合未因本次五星分支全部通過。                                                                                                                   |
| UC14 低分評價與客服聯絡意願     | 61fa B一星同意聯絡建立同單案、E兩星拒絕聯絡無案保留；2fd897原核心與加驗的隔離流程亦通過。4cf8本次五星不要求聯絡及另行車資／服務申訴，不能替代B／E低分分支。                                                                                                | 本版共享B／E低分頁面與案件讀回尚未執行；真人客服接案、實際聯繫及通知送達未證明，建案不代表已聯繫本人。                                                                             |
| UC15 遺失物車資與服務申訴       | 4cf8共享同一完程單建立車資與服務兩案，各經備註、指派、解決及關閉，保留建立加四動作的精確五筆歷程，以及各四筆後續完成回執與稽核編號。61fa遺失物五次原回執仍屬舊共享證據，不與本輪四次混計。                                                                 | 本次沒有重跑遺失物分支；真人聯繫、電話與錄音、實際爭議處理、失物認領及物品返還均未執行，系統結案不代表物品已歸還。                                                                 |
| UC16 福利優惠與輪椅無障礙服務   | 既有七種服務產品、資格／權益與輪椅能力需求的規格對應已有程式核對；2fd897隔離及4cf8共享八測試均沒有真正福利資格或無障礙車司完整正向旅程。一般預約、無福利參考值與合成車司不構成本案通過。                                                                   | 福利方案／身分／區域／費用、真正合格供給、完整選址至完程，以及無專車／資格不符／取消／照護者協助均待。原轉人工提示只證明系統拒絕處理，不能聲稱轉介成功、可用專車或永久排除原需求。 |

保留所有原五組與完整UC01–16條件。E04正式開立業者／歷史營運業者／已結清付款／總額通行費規格及原USER未答條件仍待；本Guide不自行回答或新增USER問題。
unknown COMMIT只採原booking/receipt範圍，非全部audit／outbox／通知送達；3s鎖競爭仍需同key/body正常重試。
合成PSP不證真卡授權、清算、退款、多worker或duplicate callback。實際browser context斷線不等於physical OS kill或數小時離線。
七既有product／eligibility／benefit／wheelchair能力mapping不證福利身分／區域／費用或真正設備供給，轉人工409也不是人工轉介完成。
61fa遺失物五次歷史回執與本R fare/service各四個後續回執、五timeline分開；結案不證真人聯繫、錄音、認領或物品交還。

本次 Guide Source 的必要DOM／lint／typecheck結果見下節；正常候選、自身CI、Root獨立review／protected merge仍待完成，以上runtime結果不替代Guide自身Source驗證。

## 本次 Guide Source 必要驗證（正常提交前）

- 既有同一 `bureau-review-page.test.tsx` 實跑12／12 PASS、0failed／0skip，原九項及新增current16三項均保留；每案情境／前提／83個有序步驟／預期／已驗／缺漏與歷史16詳情均核對。
- 四個受影響TS／TSX檔的scoped ESLint exit0；i18n guard exit0（686 files、原81 exemptions，沒有新增例外）。
- Passenger單次 `pnpm exec tsc --noEmit --incremental false -p apps/passenger-app-web/tsconfig.json` exit0／28.21秒，沒有typegen／wholebuild或增量產物；未重跑Journey47／native或其他大compiler。
- 原資料 `content.ts` 與acceptedR逐byte相同，SHA256=`5ff1320b7350042fb340cfbe215781e00de1b5f147aefc5ed5105dbf1bf108ba`。只對正常六scope做程式與文件更新；未改Journey功能或原候選。
- 原log／JSON在同Guide evidence目錄：`guide-current16-page`、`guide-current16-eslint`、`guide-current16-i18n`、`guide-current16-passenger-tsc`，各保存當時六Sourcehash與真exit。Root隨後指正兩處純字串：將302645ms明確標為整個OTP測試時長，並分開歷史遺失物五次回執與本輪fare/service各四次。83步數及五timeline不變；該字串修正後再跑DOM與lint，原TSC僅保留其當時hash信用，不宣稱重跑或讀過未來文字。文件後續只補真結果及必要排版。

聯絡手機提示的原窄Source信用與本R八測試分開：`booking-screen.tsx` 的phoneReady保留requireSmsVerification判斷，登入手機與聯絡手機驗證獨立；已登入不代表聯絡手機自動驗證。本次八測試沒有另驗提示的兩種狀態，不廣稱全覆蓋或新增產品／gate。

本次仍需正常checkpoint／plainpush／完整literal candidate handoff、自身必需CI、Root獨立review及protected merge；Source驗證不錄runtime key，也不自行部署。

最後純文案修正後，同一12DOM再實跑12PASS／0skip／0fail，scoped lint與i18n均exit0，記錄為`guide-current16-page-copy-final`、`guide-current16-eslint-copy-final`與`guide-current16-i18n-copy-final`。原28.21秒TSC不重跑；其後只有UC15一句回執數量說明字串變更，三個其他程式檔byte相同，未宣稱TSC讀過未來字串。
