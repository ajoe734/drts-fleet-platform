# SR-DEV-VAPID-SECRETS-20260916 — dev 部署條件式掛載 VAPID secret

- **Task ID**: `SR-DEV-VAPID-SECRETS-20260916`
- **任務名稱**: dev 部署條件式掛載 VAPID secret
- **Owner**: `Claude2`；**Reviewer**: `Gemini`
- **前置相依 (Dependencies)**: `SR-PUSH-WEBPUSH-20260915`（Web Push 實作已合併於 `origin/dev`，讀取 `PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY` / `PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY` / `PASSENGER_WEBPUSH_VAPID_SUBJECT` 三個環境變數）
- **產品決策參照**: 2026-09-15 使用者決策——乘客離頁推播採自簽 VAPID 的瀏覽器 Web Push，不新增外部供應商

---

## 1. 範圍與不變項 (Scope & Invariants)

`SR-PUSH-WEBPUSH-20260915` 交付了 `WebPushTransport`，但它讀的三個環境變數在 `.github/workflows/deploy-dev.yml` 的 `deploy` job `api_secrets` 步驟裡從未被掛給 API 服務，因此 dev 上 `WebPushTransport.isAvailable()` 恆為 `false`。本任務只補這一個掛載缺口，不改動 `WebPushTransport` 本身、不改動既有已掛載的任何 secret。

不變項：

- 既有 `DATABASE_URL`、`API_KEY_SALT`、`JWT_SECRET` 三個掛載完全不變。
- `--set-secrets` 語意是整組取代；一個不存在的 secret 名稱會讓 `gcloud run deploy` 失敗。三個 VAPID secret 必須「皆存在才掛，任一缺席就完全不掛」，不得部分掛載。
- 缺 VAPID 憑證不得讓 dev 部署失敗；只能讓 Web Push 維持未設定。
- 不得將 secret 值 echo 或寫入 workflow 輸出/日誌/artifact。
- VAPID 私鑰、subject 不得進入任何 `NEXT_PUBLIC_` 變數——本任務未觸碰任何 web app 的 env，只改 API 服務的 `--set-secrets`。VAPID 公鑰本來就不是走 `NEXT_PUBLIC_`：前端透過既有的 `GET multi-taxi/push/vapid-public-key` API 端點取得（見 `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1171-1180`），本任務同樣不需要新增任何公鑰相關的 env 掛載。

## 2. 實作內容 (What Was Built)

`.github/workflows/deploy-dev.yml` 的 `deploy` job，`Resolve API secret mounts` 步驟（`id: api_secrets`）新增一段，緊接在既有 `google-maps` 三件套的「全有或全無」條件掛載模式之後、`llm_secret` 判斷之前：

- 依 `secret_prefix`（預設 `drts-dev`）組出三個 secret 名稱：`${secret_prefix}-passenger-webpush-vapid-public-key`、`-private-key`、`-subject`。
- 用既有 workflow 已經在用的 `gcloud secrets describe ... >/dev/null 2>&1` 模式逐一探測是否存在（不讀值，只問存在與否，探測結果不含任何 secret 內容）。
- 三者皆存在（`vapid_secret_count -eq 3`）：把 `PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY=...:latest,PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY=...:latest,PASSENGER_WEBPUSH_VAPID_SUBJECT=...:latest` 併入 `secret_args`（後續唯一被用於 API 服務 `--set-secrets` 的變數，`.github/workflows/deploy-dev.yml` 的 `Deploy — api` 步驟）。
- 三者皆缺席：輸出 `::notice::` 說明 dev 部署時 Web Push 維持未設定（`isAvailable()` 保持 `false`），不附加任何一個。
- 部分存在（1 或 2 個）：輸出 `::notice::` 點名還缺哪幾個，同樣完全不附加——維持「全有或全無」，不製造一個 API 進程啟動後 `resolveVapidConfig()` 必然回傳 `null`（因三者缺一即 `null`，見 `apps/api/src/modules/multi-taxi/web-push.transport.ts:50-52`）但部分金鑰已白白掛載到執行環境的中間狀態。
- 選擇 `::notice::` 而非 `::error::`：對齊本步驟裡既有 workload-identity 與 map-provider 判斷式的既有慣例——「可選功能缺席」用 `notice`，「必要功能缺席」才用 `error`（例如同一步驟裡 `controlled_download_secret`、`referral_handoff_secret` 缺席即 `error` 並 `exit 1`）。VAPID 屬於前者。

此改動只新增條件式分支，不修改 `secret_args` 既有前綴部分的任何一行，也未改動 `web_secret_args`、`ops_secret_args`、`referral_embed_secret_args`（VAPID 只掛給 API 服務，不涉及任何 web app）。

## 3. 未做的事 (Explicitly Out of Scope)

- **不建立 GCP Secret Manager 裡的實際 secret**：本任務只改 workflow 的條件式掛載邏輯。三個 secret（`drts-dev-passenger-webpush-vapid-public-key` / `-private-key` / `-subject`）由 dev 專案的操作者以 `gcloud secrets create` 建立並塞入自簽 VAPID 金鑰對（可用 Node 的 `crypto.generateKeyPair("ec", { namedCurve: "prime256v1" })` 產生，取未壓縮公鑰與 32-byte 私鑰純量，符合 `web-push.transport.ts` 的 `isValidUncompressedP256PublicKey` / 32-byte 私鑰檢查）；本文件不代為建立雲端資源。
- **不改動 `WebPushTransport` 或任何 `apps/api` 程式碼**：讀取這三個環境變數的邏輯已在 `SR-PUSH-WEBPUSH-20260915` 交付。
- **不涉及 staging/prod 的部署 workflow**：本任務 artifacts 僅列 `deploy-dev.yml`。

## 4. 驗證 (Verification)

本任務在 supervisor/worker 沙箱中完成，環境限制不得啟動 GCP 資源或實際觸發 GitHub Actions 執行，因此：

- **靜態驗證**：`python3 -c "import yaml; yaml.safe_load(...)"` 確認整份 `deploy-dev.yml` 仍是合法 YAML；把 `api_secrets` 步驟的 `run:` 區塊單獨抽出以 `bash -n` 驗證 shell 語法正確。
- **未執行**：實際 `gcloud secrets describe` 呼叫、實際 `gcloud run deploy`、GitHub Actions 上的 `Deploy — Dev` workflow。

### 三者齊備時如何驗證 `isAvailable()` 由 `false` 轉 `true`（給之後在真實 dev 環境操作的人）

1. 在 `DEV_GCP_PROJECT_ID` 專案下，以 `gcloud secrets create drts-dev-passenger-webpush-vapid-public-key/-private-key/-subject` 建立三個 secret 並塞入合法值（見 §3 第一點的產生方式；`subject` 需為 `mailto:` 或 `https://` URI，符合 RFC 8292）。
2. 觸發一次 `Deploy — Dev`（push 到 `publish/v*` 或 `workflow_dispatch`）。`Resolve API secret mounts` 步驟的日誌應**不再**出現本任務新增的 VAPID `::notice::`（因為三者齊備，直接進入掛載分支，不落入任一個 `else`/`elif` notice 分支）。
3. 部署完成後，`GET <api_origin>/multi-taxi/push/vapid-public-key` 應回傳非 `null` 的公鑰字串（原本三者皆缺時，`multi-taxi.service.ts:1179` 的 `process.env.PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY?.trim() || null` 會回傳 `null`）。
4. 乘客端走一次 `SR-PUSH-WEBPUSH-20260915` §2.5 的訂閱流程（`POST .../push-subscriptions`），確認不再收到「VAPID credentials are not configured」相關的 5xx（對應 `web-push.transport.ts:80` 的 `throw new Error("Web Push VAPID credentials are not configured.")`）。
5. 此後即為 `SR-LIVE-PUSH-001` 真裝置驗收的前置環境條件；本任務不涵蓋真裝置驗收本身。

## 5. Secret 命名與建立責任 (Secret Ownership)

| Secret 名稱（`secret_prefix` 預設 `drts-dev`） | 對應環境變數 | 建立者 |
| --- | --- | --- |
| `${secret_prefix}-passenger-webpush-vapid-public-key` | `PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY` | dev GCP 專案操作者（非本任務範圍） |
| `${secret_prefix}-passenger-webpush-vapid-private-key` | `PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY` | dev GCP 專案操作者（非本任務範圍） |
| `${secret_prefix}-passenger-webpush-vapid-subject` | `PASSENGER_WEBPUSH_VAPID_SUBJECT` | dev GCP 專案操作者（非本任務範圍） |

三者皆掛給 API 服務（`drts-dev-api`），不掛給任何 web app 服務。
