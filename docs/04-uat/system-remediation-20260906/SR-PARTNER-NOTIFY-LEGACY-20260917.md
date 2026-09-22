# SR-PARTNER-NOTIFY-LEGACY-20260917

退役乘客網頁已移除 Web Push 註冊入口、專屬 subscription helper 與 worker。此文件記錄 repository checks；不代表真夥伴、裝置、部署或 merge 驗收通過。

## 範圍、來源與候選

- Base：`1750224ac70dd819184a579f19773f3662fa513e`，包含已合併的 partner transport/DI。
- 沿用 Gemini 已發布實作與退修提交，原 PR：[#2077](https://github.com/ajoe734/drts-fleet-platform/pull/2077)，原 head：`ca8f4ed23639ff1219ec3b82eda8cf56f4a72d79`。
- 本次派工 owner=Codex、reviewer=Codex2；在指定 `codex/sr-partner-notify-legacy-20260917` 分支 fast-forward 接續原歷史，再追加修正，沒有 rebase、amend 或 force push。
- 已驗證程式版本：`f51febf12c18e947bf76e1d3f6191b5c5f6c58c8`。本文件更新不改產品或測試程式。
- 最終 candidate 是本文件提交後的 branch HEAD；完整 SHA 與 PR URL 由 canonical `ai-status.sh handoff` 寫入 task 的 `candidate_sha`、`candidate_branch`、`pr_url`。上方程式版本不是最終 candidate。Review、CI、merge 必須核對 handoff SHA，不能沿用原 PR 的結果。
- Supervisor 已核准額外兩檔 scope：API 的 subscription repository 與對應 endpoint tests。所有變更限於 task 的八項 write scopes。

## 修正與保留行為

1. 乘客頁移除 `PushNotificationPrompt`、通知權限／訂閱入口，以及因此失去用途的內部 `PassengerScreen.kind` prop；外層 `PassengerRidePage.kind` 仍用於行程、費用、收據資料映射。
2. 刪除無其他 consumer 的 [subscription helper（base 歷史版本）](https://github.com/ajoe734/drts-fleet-platform/blob/1750224ac70dd819184a579f19773f3662fa513e/apps/passenger-web/lib/passenger-push-subscription.ts) 與 [push worker（base 歷史版本）](https://github.com/ajoe734/drts-fleet-platform/blob/1750224ac70dd819184a579f19773f3662fa513e/apps/passenger-web/public/sw.js)。沒有新增全域 unregister。
3. 清除已不在 production DI 中的 `PassengerPushDeviceResolver`、失效 resolver/delivery tests、unused declarations/type import 及過時註解。原退修的 `beforeEach`、`vapidEnv`、`outboxRecord` 已移除；後續 CI 發現的 unused `kind` 亦已修正。
4. `PassengerPushRepository` 與其 API 相容性測試保留。Endpoint suite 只驗 subscription API，不能稱作 Web Push delivery proof。真正的 WebPushTransport/crypto 回歸仍由原有獨立 suites 驗證。
5. Partner module、adapter、傳輸、retry/outbox、部署、IAM 與 secrets 沒有變更。頁面既有前景資料讀取／訂閱保留，未把 Web Push 移入 referral WebView。
6. 舊 evidence 引用已刪除檔案而觸發 cited-paths gate；現在使用固定 base 的歷史連結。

## 可重跑驗證

日期：2026-09-19 UTC。下列命令均在指定 task worktree 執行。沒有啟動產品、API、preview、browser、receiver、DB server 或 Compose。

原繼承的 node_modules symlink 指向已移除的 Gemini NAV worktree，`pnpm exec lint-staged --no-stash` 與原 canonical prettier binary 都以 `MODULE_NOT_FOUND`、exit 1 結束，不能算驗證成功。僅移除本 task worktree 的 dependency symlinks 後，執行 `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline`，exit 0；lockfile 未修改，canonical root 的依賴未修改。以下使用修復後的本地依賴。

### Lint、型別與單元回歸

```bash
pnpm exec eslint --no-cache --max-warnings=0 apps/passenger-web/components/passenger-ride-page.tsx apps/api/src/modules/multi-taxi/passenger-push.repository.ts tests/unit/system-remediation/sr-push-webpush-20260915
pnpm --filter @drts/passenger-web lint
pnpm exec vitest run --no-cache tests/unit/system-remediation/sr-push-webpush-20260915 tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.test.ts
pnpm --filter @drts/passenger-web typecheck
pnpm typecheck:root
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
```

各命令 exit 0。Vitest：5 files / 52 tests passed，包含保留的 subscription repository/API、WebPushTransport、crypto 與 partner DI/no-fallback 回歸。Contracts/auth build 僅為 API typecheck 產出本 worktree 的 ignored declarations，沒有啟動服務。

```bash
git diff --check origin/dev HEAD
python3 tools/ci/git/check_staged_generated_files.py --staged
python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD
```

各命令 exit 0。Pre-commit formatting/lint 以 `pnpm exec lint-staged --no-stash` 明確執行；提交不依賴 stash 備份。退修新增的空白與文件 cited-paths 問題已修正。

## 三項具名 acceptance 證據

### retired_passenger_web_no_push_registration_or_dead_callers

Base caller inventory：

```bash
git grep -n -E 'PushManager|pushManager|serviceWorker|Notification\.requestPermission|subscribePassengerPush|isWebPushSupported|passenger-push-subscription|PassengerPushDeviceResolver' 1750224ac70dd819184a579f19773f3662fa513e -- apps packages tests/unit/system-remediation/sr-push-webpush-20260915
```

Exit 0。Runtime registration callers 只在乘客頁與被刪除 helper；resolver 只剩自身宣告與被移除的 tests，production DI 在 base 已切換。API 另有 PushManager 的說明註解，不是 browser registration caller。

清理後：

```bash
git grep -n -E 'PushManager|pushManager|serviceWorker|Notification\.requestPermission|subscribePassengerPush|unsubscribePassengerPush|isWebPushSupported|passenger-push-subscription|PushNotificationPrompt' -- apps/passenger-web
git grep -n 'PassengerPushDeviceResolver' -- apps packages tests
```

兩項均 exit 1、零 matches（預期的搜尋空集合，不是工具錯誤）。已無乘客頁註冊入口、helper import 或 resolver caller。

### partner_di_remains_without_webpush_fallback

```bash
git grep -n -E 'PASSENGER_PUSH_(ADAPTER_CONFIG|TRANSPORT)|transportMode|useExisting' -- apps/api/src/modules/multi-taxi/multi-taxi.module.ts
```

Exit 0。`MultiTaxiModule` 固定 `transportMode: "partner_webhook"`，transport 使用 `PartnerNotificationTransport`，沒有 WebPush/device-resolver provider。既有 transport suite 驗證 DI metadata、missing binding 不走 legacy fallback，且 fetch/device resolver 不被呼叫。現行 module 沒有可由環境設定切回 legacy 的開關；adapter 保留的 legacy 程式碼不是 production DI 的 fallback。

### existing_secrets_and_other_service_worker_uses_preserved

```bash
git grep -n -E 'serviceWorker|service-worker|sw\.js' -- apps packages
git diff --name-status origin/dev HEAD
git diff --exit-code origin/dev HEAD -- .github operations infrastructure infra eslint.config.mjs apps/passenger-web/eslint.config.mjs apps/api/src/modules/multi-taxi/multi-taxi.module.ts apps/api/src/modules/multi-taxi/web-push.transport.ts apps/api/src/modules/multi-taxi/web-push-crypto.ts tests/unit/system-remediation/sr-push-webpush-20260915/web-push-transport.test.ts tests/unit/system-remediation/sr-push-webpush-20260915/web-push-crypto.test.ts
```

各命令 exit 0。Worker 搜尋僅剩 passenger-web ESLint 的 `public/sw.js` 檔名 glob；它不會註冊或載入 worker。Base inventory 未發現其他 app/package 的 registration consumer；刪除的 worker 僅處理 push 與 notificationclick。沒有全面 unregister，也未改任何其他 worker 用途。完整差異只有七個允許的產品、test、evidence paths；上述受保護路徑零 diff。既有 VAPID 三項 secret 未讀值、未刪除、未變更，未查詢或更動部署/IAM 的 live 狀態。

## CI 與未執行範圍

- 原 `ca8f4ed23639ff1219ec3b82eda8cf56f4a72d79` 的 [Product smoke lint](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35453191552/job/105924088826) 失敗於 unused `kind`；[Canonical consistency](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35453191552/job/105923804933) 失敗於刪除檔案的路徑引用。這些失敗均有本次修復，但本地通過不能代替新 candidate 的 GitHub CI。
- 新 candidate 尚待 Codex2 獨立審查及同 SHA 的 CI、merge；三項具名證據供 candidate lifecycle 驗收，未自行寫 done。
- 未執行 live partner HTTPS、夥伴 durable inbox、真機 APNs/FCM、背景／鎖屏／冷啟動、通知點擊、runtime/PG/browser、部署驗證。沒有將 unit/mock 結果宣稱為 partner accepted、device received 或 opened，沒有復活或部署 retired passenger-web。
