# SR-LIVE-GLOBAL-UX-20261007 — C120/C121 同 release 驗收

Owner Codex2；獨立 reviewer Claude2。狀態：harness 候選準備／獨立審查，未取得 live／人工驗收。不得以 offline pass 關閉四項 acceptance。

## 固定來源與邊界

- 起始 `origin/dev`：`2467f88a2e64ccc2204bb99f1356fdeb997bda13`（2026-10-07 fetch）。
- 已讀 dispatch task spec、canonical root 的外部本機報告 `/home/lupin/workspace/drts-fleet-platform/docs/04-uat/full-system-inventory-20261007/REPORT.md` 及同目錄 134 項 capability matrix。報告未追蹤於此候選或 `origin/dev`，不是 checkout 內可用的檔案或 runtime source；本次讀回 SHA256 為 `cd58e6b59672686d327f68766d2935fa58ace6cedc488149d0a958a9200a6fe6`。其 V15 要求同 release 全畫面鍵盤、讀屏、焦點、對比、窄屏、多語與新版 screen/state 對照；執行契約與四項 acceptance 完整保留於本文，CI 不依賴這份外部報告。
- 部署權威：`.github/workflows/deploy-dev.yml` 的八個 web services 與 API。2026-10-07 GitHub variables 讀回 `drts-dev-devcc-20260825 / us-central1`；workflow 仍須讀執行當時的變數與 deployment readback。
- 舊 `sr-qa-ux-001` 的 C120 viewport／焦點與部分 C121 格式測試為模擬資料，不能作為 live 結果。本任務不重做 producer，不修改產品 UI／中央套件設定。
- VM 只跑 repository-safe checks；browser 僅在 GitHub hosted runner 對 shared dev。Worker 不 dispatch、不部署、不改 IAM、不啟動 webServer。
- `partner-booking-web` paused；`passenger-web`、`concierge-portal-web`、`assisted-entry-web` retired；依 deploy workflow／custom-domain runbook 排除。ROC 不在 active deploy inventory（C128）；tenant-portal-web 不是 active tenant-console-web。Driver native 另案；raw Passenger、driver17/18/20/21 都不是已採用畫面證據，不重開第一方乘客登入／預約。

## 執行模型與來源

`inventory.ts::inventoryAt` 只讀指定完整 runtime SHA 的 Git tree，核對 deploy workflow，枚舉 active Next `page.tsx`，另讀 Referral `EmbedScreen` 和 `EMBED_TRIP_FALLBACK_SCREENS`。每列保留 route、source path、Git blob、source commit、角色和 `design:unverified`。原始碼存在不等於功能已驗收。

角色依據為 `packages/contracts/src/iam-policy-catalog.ts`（tenant 四角色、platform_admin、ops_user／ops_observer、partner_api_key／partner_user／referral_passenger）及 bank `lib/session.ts::BankConsoleRole` 三角色，共 18 個 app-role 身分。受限角色在無權頁面應驗證真正拒絕畫面。

起始來源含 176 個 page files，加 14 個 Referral query screens＝190 entries。每個 app-role/page 保留 default、empty、validation、error、loading、expired、permission、dialog 八狀態 × zh-TW／en-US × 390／768／1440px，保守分母 20,160 cases。這是待判定清單，**不是已執行數或完成率**。頁內 tabs／drawer 須在 recipe／人工設計 mapping 逐項操作；發現未列重要 screen，先擴充 reviewed inventory 再驗收。

`applicability.json` 目前為空，未擅自減分母。真正不存在的某頁狀態，須逐 `screen.id|role|state` 填 runtime SHA、source blob、source decision 引用與理由，隨新 candidate 審查。外部 plan 不能宣告 N/A，default 整頁不能排除。N/A 仍輸出、保留總數，與 passed／failed／blocked／skipped 分開。

正式設計依據：`docs/05-ui/design-handoff-20260525-implementation-plan.md` §5、`packages/ui-web/src/management-*`／canvas primitives；正式 locale 依據為各 app `server-locale`／`i18n`／`translations`，共用 `drts-locale-v2`（zh/en），bank 另用 locale query。服務契約 §2.2 要求 UTC 儲存、按使用者／租戶 locale 顯示，format probes 必須明寫 timezone。

## Supervisor／Operator 執行契約

PR 只執行 offline tests／typecheck／lint。Hosted workflow 使用 `ubuntu-latest`、`shared-dev-acceptance` environment，保留不同的 harness SHA、runtime SHA。Worker 不直接 dispatch。

1. 用完整 runtime SHA 產生 source manifest、完整 recipe obligations 和 draft plan。以下命令 repository-safe，不啟動 browser、HTTP server 或 DB：

   ```bash
   GLOBAL_UX_OUTPUT=.local/sr-live-global-ux-20261007/scaffold \
   RUNTIME_SHA=<full-runtime-sha> \
   node --import ./apps/api/node_modules/tsx/dist/loader.mjs \
     tests/e2e/system-remediation/sr-live-global-ux-20261007/runner.ts scaffold
   ```

   草稿含來源核對過的 Enterprise `/auth-required` 四角色 default recipes；approval 空白、期限已過，不能冒充已獲授權執行。其餘情境須依真實 fixture 編寫，缺少則輸出 blocked。

2. Operator 準備同 repository 的 `global-ux-input` artifact：`plan.json`、`manual.json`、`artifacts/`，不含 credentials。workflow 輸入 artifact 的 `bundle_run_id` 及已審查 `plan_sha256`。正式型別為 `model.ts` 的 `Plan`、`Recipe`、`Step`、`ManualEvidence`；`guards.ts` 做 runtime validation。

3. Plan 必須有 runtime SHA、具體 approvalRef、有效期限、`sandboxOnly:true`；recipe key 為 `screen.id|role|state`。填真實 route／最終 path、document status、ready selector、精確中英文 state text／來源 path、鍵盤 steps、date/money probes、screenshot masks。動態 ID 使用隔離 sandbox data。僅 Tab／Enter／Space／Escape、向已聚焦欄位輸入、焦點／文字斷言；沒有 DOM 注入、假 API response 或假產品 state。validation 必須真鍵盤送出和核對錯誤焦點；dialog 必須真開啟、focus trap、Escape 與返回；loading 必須出現 busy／progressbar。無日期／金額須有 source rationale。

4. Protected secret `GLOBAL_UX_SESSIONS_JSON` 是 `Session[]`：每 app-role 一份核准 reference、sandbox alias、`named-human` 或 `authorized-isolation`、origin-bound storageState，及權威 identity readback path／subjectPath／rolePath／expectedSubject。cookie 必須精確 host-only、secure；variant sessions 支援真到期／拒絕。每個 baseline 先向同 origin endpoint 核對 subject、role、runtime header。**Invoker token 不是 app login，demo-bootstrap 不是 IAP/OIDC 人類登入。** 若某 surface 缺合法 readback endpoint，仍 blocked，由 Supervisor 協調最小 verifier／產品 scope，不能猜造端點或身份。

5. Workflow 讀當次 DEV_GCP project／region 及 DEV WIF credentials。對固定九服務 `gcloud run services/revisions describe`，拒絕混合 SHA／不完整 100% traffic；安全 manifest 只保留 origin、revision、image、SHA。API `/api/health` body/header、每個頁面與同 origin fetch/xhr header，以及結束後 revisions 均須一致。執行前後 manifest 改變即 fail。

6. Invoker tokens 只存私有暫存檔；逐 request 去掉繼承身份 headers，只對 exact origin 注入 token。使用 `route.fetch(maxRedirects:0)` 並 fulfill 單次 response，redirect 重新經 origin gate，避免 header override 被轉送。跨 origin navigation 拒絕，第三方資源無 app token／cookie／referer。到期 token 只用既有 SA 更新，不擴 IAM。

7. Operator 從包含 workflow 的 immutable ref dispatch，指定 `harness_sha`、`runtime_sha`、`bundle_run_id`、`plan_sha256`；dispatch ref 必須等於 harness SHA。如果 workflow 尚未在 default branch 註冊，沿既有 publish/promote lifecycle，不能由 worker 改 main 或啟 VM。

## 證據、人工程序與限制

每 case JSON 保留 source/blob、role、實際 route、locale、viewport、runtime/harness SHA、run/attempt、plan digest、session provenance、stage、結果。console 只存 error count，避免原訊息洩漏 PII；trace／video／自動 failure screenshot 關閉。安全 sandbox screenshot 套明列 masks 並存 SHA256；未到 screenshot 階段的失敗沒有截圖，case stage 保留定位。

自動探針量測：單一 main、heading、visible controls 的 accessible name、duplicate IDs、positive tabindex、逐 Tab 可達性及變化的 outline/shadow、焦點可見／遮擋、document overflow／control clipping、locale lang、dictionary raw-key／部分 machine text／icon-font loading、實際 UI 日期／TWD 字串、runtime headers／console errors。保留 branding／數字代碼，沒有一律禁止 Latin text。

對比只計算真 computed style 的不透明 solid foreground/background：普通字 4.5:1、大字 3:1，記錄 measured／unmeasured／minimum。透明、漸層、圖片、filter、抗鋸齒、非文字／focus contrast 不在自製 probe 能力內。這不是 axe、完整 WCAG 或完整讀屏認證，未新增依賴。

`manual.json` 對每個 applicable case 必須有四項實際 passed evidence；各項填 tester、tool/device/browser/AT version、procedure／observed result、sourceRef、artifact path/hash，並匹配 runtime SHA、harness SHA、plan hash，保留實際 run/attempt：

- `keyboard`：全程鍵盤，檢查順序、可見焦點、不可達／重複不可操作 action、表單錯誤名稱及焦點、dialog trap/return、narrow 下輸入與 CTA 遮擋。
- `screen-reader`：真實 OS／裝置上的 NVDA＋Firefox/Chromium 或 VoiceOver＋Safari；記實際版本及中英播報，核对 landmarks、heading、controls、錯誤／loading/empty/live region、dialog 名稱／返回。Headless tree 不可代替。
- `contrast`：使用視覺與測色工具核對自動未量測文字、圖片背景、focus／非文字狀態；三 viewport、長中英字串、縮放／鍵盤開啟下的主要內容及 CTA，附安全截圖與測值。
- `design-mapping`：每 screen/state 對採用的正式設計 artifact／章節、實際 source SHA/blob、UAT case ID、結果；raw Passenger／driver17/18/20/21 保持 reference-only/unverified，除非有採用決議。manifest 的 `design:unverified` 不由檔名存在而升級。

第一次可先取得 browser evidence；缺人工或任何 applicable case 失敗／未跑／skip，整體 gate 仍失敗。同版本／同 plan 的前次人工 evidence 可重用，須附該 run 的 artifact bytes；不能以歷史產品 SHA 或不同 fixture 代替。Workflow 只上傳安全 JSON、測量結果及核准 artifact，不上傳 session、token、trace 或 plan 的私有输入。

產品缺陷須按 case ID／route／trigger／source blob／舊 fail artifact 請 Supervisor 建 conflict-safe repair child；部署修復 SHA 後重驗。本 QA task 不靜默修改產品。

## Repository-safe 驗證紀錄

初始 worktree modules 指向共用失效 symlink，首次 prettier／tsc 退出 1（MODULE_NOT_FOUND），一次 install 因無 TTY 退出 1，均未算 pass。只解除本 worktree dependency links，`CI=true pnpm install --frozen-lockfile --ignore-scripts --offline` 成功，未改 lockfile 或共享 modules。

第一輪 38 tests passed，tsc／lint 各一處 harness 問題已修；第二輪 39 tests、scoped tsc、scoped ESLint 均退出 0。其後補 source-derived Referral fallback screens／scaffold 檢查，最終 candidate 再跑下列 checks；exact SHA、退出碼和日誌記於 `.local/sr-live-global-ux-20261007/verification.json` 及 handoff。這些只證明 harness，非產品 live pass。

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-live-global-ux-20261007
pnpm exec tsc --noEmit -p tests/unit/system-remediation/sr-live-global-ux-20261007/tsconfig.json
pnpm exec eslint tests/e2e/system-remediation/sr-live-global-ux-20261007 tests/unit/system-remediation/sr-live-global-ux-20261007 playwright.live-global-ux.config.ts --max-warnings=0
pnpm exec prettier --check tests/e2e/system-remediation/sr-live-global-ux-20261007 tests/unit/system-remediation/sr-live-global-ux-20261007 playwright.live-global-ux.config.ts .github/workflows/live-global-ux-acceptance.yml docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md
```

## Finding／驗收追蹤（§0.7）

### CI-DOC-01：外部盤點報告被誤寫為 checkout 相對引用

- 原候選 `0fa7d8d8376bf0ed25f0daa34abe09e8f951ac83`；來源為 [Canonical consistency job 112690942623](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37590615931/job/112690942623)，不是獨立 reviewer 的退修。該候選專屬 [offline CI 37590615992](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37590615992) 通過，hosted job skipped；不得沿用為新 SHA 的 CI 通過。
- 最小重現：`python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` 在原候選退出 1；`check_cited_paths` 將「固定來源與邊界」的報告相對路徑解析為 checkout 檔案，但該檔案僅存在於 canonical root 的未追蹤報告包。
- 修正邊界：僅改本文，明列外部本機絕對路徑、內容雜湊與 V15 要求；不複製未追蹤報告進產品來源、不繞過 consistency gate、不改 harness 或縮減驗收。
- 修正版同一 consistency 命令退出 0，四類 finding 均為 0；`git diff --check` 退出 0。完整 SHA、命令／退出碼及遠端 head 核對保存在 worker `.local/sr-live-global-ux-20261007/dispatch-2/verification.json`，由新 handoff 綁定。舊版失敗輸出為同目錄 `canonical-before.log`；GitHub 原始 job log 為 `canonical-consistency.log`。本輪僅文件來源修正，無新的 browser／產品行為結果；四項未驗限制沿用下表。

| Finding／驗收項                                  | 原始碼與修改位置                                                                         | 舊版重現 → 修正版結果                                                             | 命令／版本／證據                                              | 未驗與限制                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| CI-DOC-01 外部報告引用                           | 本文「固定來源與邊界」；`tools/ci/git/check_canonical_consistency.py::check_cited_paths` | 舊候選退出 1 → 修正版同一命令退出 0；非產品行為回歸                               | 原 CI job 112690942623；本輪 before／verification 紀錄        | 文件檢查非產品 live；新候選 CI／獨立 review 仍須匹配新 SHA                                                   |
| reviewed_same_sha_global_ux_harness              | inventory／guards／runner、workflow、unit suite                                          | 舊版無本 harness；新 parser 拒絕缺列、重複、skip、錯 SHA、假 N/A、壞 artifact     | 上列 checks；SHA 由 handoff 鎖定；exact CI／Claude2 review 待 | Source readiness 不代表 review/live                                                                          |
| same_release_role_screen_state_coverage          | deploy-dev、IAM catalog、正式 pages／Referral source、browser spec                       | 舊 synthetic suite 不驗 runtime；新 source/schema offline pass，不冒稱舊產品 fail | `.local/.../scaffold/`、unit logs；hosted 尚無                | 18 app-role sessions／權威 readback、核准 state recipes／動態 ID、同 release runtime、source-reviewed N/A 待 |
| accessibility_keyboard_focus_responsive_evidence | browser-checks、keyboard/dialog recipes、manual gate                                     | 舊模擬非實測；新 DOM probes 編譯，browser 未跑                                    | offline tsc/lint；browser/manual 未執行                       | 真 AT/device、具名 tester、完整對比／鍵盤／三斷點待                                                          |
| zh_tw_en_locale_content_and_design_mapping       | 正式 cookie/query、translations、format probes、source blobs                             | 舊 dictionary pass 非 live；新 timezone 跨日／currency gate unit pass             | source inventory/unit；live/design 未執行                     | 中英 state recipes、正式設計逐項對照待；raw ZIP 不替代                                                       |
