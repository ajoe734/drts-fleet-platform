# 補齊交通局公開入口首次雲端啟用的 Compute／IAP API bootstrap

`PAX-BUREAU-BROWSER-ENTRY-20261018` 的原始碼（`operations/deployment/passenger-bureau-entry/`）
已經 review/CI/merge（候選 `636cf96734bc42e2cb0136f60e2fc8a1e43d52a9`，immutable
歷史交付，本次不重開、不修改）。Root 統一部署到 `drts-dev-devcc-20260825`
時，實際遇到兩筆獨立的首次雲端啟用前置缺口，兩者都在這個全新專案從未用過
Compute Engine／Cloud IAP 的情況下才會出現：

1. **`compute.googleapis.com` SERVICE_DISABLED**（真實 run
   [39166716207](https://github.com/ajoe734/drts-fleet-platform/actions/runs/39166716207)，
   `publish/v2026.10.18.7`，`passenger-public-entry` job）：
   `setup-passenger-public-entry.sh` 第一個 `compute
   network-endpoint-groups list` 呼叫就失敗，因為這個專案的 Compute Engine
   API 從未啟用過。WIF 驗證與 project lookup 本身成功，沒有拿到靜態 IP 或
   可用 URL；這不是已證明缺少任何 IAM role。
2. **冷 Cloud SDK 的 beta 元件安裝需要互動確認**（真實 run
   39165989369，同批次 DeployDev）：該次十個既有服務的 deploy steps 全部
   success，但最後 `grant-passenger-app-iap-invoker.sh` 呼叫 `gcloud beta
   services identity create` 時，gcloud 偵測到這台 runner 的 Cloud SDK
   （568.0.0）從未安裝過 `beta` command group，嘗試互動詢問是否自動安裝
   `gcloud Beta Commands` 元件；noninteractive runner 無法回答這個 `Do you
   want to continue (Y/n)?`，實際錯誤是 gcloud 自己的 `This prompt could
   not be answered because you are not in an interactive session. You can
   re-run the command with the --quiet flag to accept default answers for
   all prompts.`。這不是 IAP API 未啟用，也不是 IAM 權限不足；先前對這個
   失敗的「IAP API 自動啟用提示」解讀已更正
   （`entry-636cf-source-review/actual-dot7-failure-classification-correction-beta-SDK-20261018T212842Z.json`）。

## 本次修正

- `setup-passenger-public-entry.sh` 在建立任何 Compute／IAP 資源之前，先
  `gcloud services enable compute.googleapis.com iap.googleapis.com
  --project="$project" --quiet`。
- `grant-passenger-app-iap-invoker.sh` 在 `beta services identity create` 之前
  先 `gcloud services enable iap.googleapis.com --project="$project"
  --quiet`，且該 `beta services identity create` 呼叫本身也加上
  `--quiet`（gcloud 錯誤訊息本身建議的修法），讓冷 SDK 的 beta 元件安裝
  確認自動採預設答案，不再卡在互動提示。
- `gcloud services enable` 對已啟用的 API 是 idempotent no-op，因此兩個腳本
  都直接無條件呼叫，不另外查詢是否已啟用；若呼叫本身失敗（例如呼叫者缺
  `serviceusage.services.enable`），在既有 `set -euo pipefail` 下直接以
  非零結束，保留原始 stderr，後面的 Compute／IAP 變更都不會被嘗試——不自行
  grant 任何 IAM role，不停用任何 API，不改動 public/private、hostguard、
  NEG 附件重試或 pause／VM 規則。
- 未變更任何 public/private 曝光、guard backend 隔離、URL map
  unmatchedHost fail-closed、或 `PAX-BUREAU-BROWSER-ENTRY-20261018` 既有
  R1–R10 的任何既有行為與斷言；原有 workflow 接線（`deploy-dev.yml`、
  `domain-mappings-dev.yml`）與 opt-in gating 不變。

## 驗證

本機測試（`tests/unit/pax-bureau-browser-entry-20261018/`，共 25 項，全部
使用 stub 的 `gcloud`，不呼叫任何真實 GCP API）：

- `setup-passenger-public-entry.test.ts`：`npx vitest run
  tests/unit/pax-bureau-browser-entry-20261018/setup-passenger-public-entry.test.ts`
  → `Tests  13 passed (13)`（原有 10 項 + 新增三項
  `ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP`）：啟用呼叫先於第一個
  Compute／IAP 呼叫、已啟用專案重跑時的 idempotent no-op、啟用失敗時整個
  腳本在任何 Compute／IAP 變更前以非零中止（保留原始
  `serviceusage.services.enable` stderr）。原有 `ENTRY-R3-*`／`ENTRY-R8-*`
  案例與斷言全部保留且仍通過。
- `grant-passenger-app-iap-invoker.test.ts`：`npx vitest run
  tests/unit/pax-bureau-browser-entry-20261018/grant-passenger-app-iap-invoker.test.ts`
  → `Tests  12 passed (12)`（原有 8 項 + 新增四項）：
  `ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP`（啟用先於 `beta services
  identity create`、已啟用時的 idempotent 重跑、啟用失敗時不嘗試
  identity create 或 grant）與 `ENTRY-R11-COLD-BETA-SDK-NOPROMPT`
  （`beta services identity create` 呼叫本身帶 `--quiet`）。原有身分建立
  排序／失敗、`allUsers` 拒絕、project number 驗證、deploy-dev.yml 接線等
  案例與斷言全部保留且仍通過（第一項「grants roles/run.invoker only」的
  `toEqual` 完整命令序列斷言已更新為包含新增的 `services enable`
  呼叫，驗證意圖不變）。
- 兩個檔案合併執行：`npx vitest run
  tests/unit/pax-bureau-browser-entry-20261018/setup-passenger-public-entry.test.ts
  tests/unit/pax-bureau-browser-entry-20261018/grant-passenger-app-iap-invoker.test.ts`
  → `Test Files  2 passed (2)` / `Tests  25 passed (25)`。
- `npx eslint tests/unit/pax-bureau-browser-entry-20261018/setup-passenger-public-entry.test.ts
  tests/unit/pax-bureau-browser-entry-20261018/grant-passenger-app-iap-invoker.test.ts
  --max-warnings=0` 通過。
- `bash -n` 對兩個 shell 腳本語法檢查通過；本機 VM 未安裝 `shellcheck`，
  未執行（未安裝，非失敗），不聲稱已跑過 shellcheck。

## 尚待 Root／operator 的邊界

本機 VM 沒有雲端身分，不執行任何真實 `gcloud services enable` 或實際部署。
若 Root 統一部署時，實際 WIF caller 真的缺少 `serviceusage.services.enable`
或 Compute/IAP 相關權限，`gcloud services enable` 會以非零結束並保留原始
`gcloud` stderr；需由具權限 operator 依該具體錯誤訊息（通常是對應的 WIF
service account 補 `roles/serviceusage.serviceUsageAdmin` 或等效的
`serviceusage.services.enable` 權限）處理，本次修正不自行 grant 任何 IAM
role、不臆測權限缺口。實際 `https://<host>/login` 瀏覽器可達性、憑證生效與
`/review-driver` 不可達，仍依
`docs/03-runbooks/passenger-bureau-browser-entry-20261018.md` §4、§5 由
operator 在真正重跑 `domain-mappings-dev.yml`／`deploy-dev.yml` 後補上，本文件
不宣稱已完成。原始失敗紀錄
（`entry-636cf-source-review/original-domain-dot7-run39166716207-attempt1-failed.log`
與 `actual-dot7-failure-classification-correction-beta-SDK-20261018T212842Z.json`）
保留不變，不在前置未變的情況下盲目重跑。
