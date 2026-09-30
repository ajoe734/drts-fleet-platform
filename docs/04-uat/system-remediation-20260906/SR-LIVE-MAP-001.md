# SR-LIVE-MAP-001 — 真地圖／定位／ETA 驗收證據

- Owner / reviewer：Codex / Claude2（2026-09-30 dispatch）。
- 判定：**provider smoke 已有真實證據；完整 C114 live 驗收尚未通過**。
- 本輪只補此驗收文件，沿用既有 runner 與 unit tests，沒有修改產品行為。
- 本文件供同一候選獨立審查；不取代 machine truth 的 review、CI、merge 或 acceptance。

## 1. 來源、版本與候選邊界

依據 [task spec](../../03-runbooks/system-remediation-20260906/SR-LIVE-MAP-001.md)、
[execution rules](../../03-runbooks/system-remediation-execution-tasks-20260906.md)、
[C114](source/capabilities.json) 與 [AI Collaboration Guide §0.7](../../../AI_COLLABORATION_GUIDE.md)。
C114 的原始缺口是「正式憑證／配額、臺灣地址、服務區、斷線與過期位置」。
因此服務區及位置過期是必要 live 情境；不能因目前 runner 沒測就刪除驗收條件。
2026-09-06 的 mock 觀察只作追溯，不作本次程式現況。

| 版本                                           | 完整 SHA / 說明                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| dispatch 時本分支 HEAD / 已部署 live candidate | `b35a1f83db378d1668f4c0d85712113a0f9f26d9`                                                                                         |
| 本輪 fresh `origin/dev` base                   | `64b47218ddd1f0c001a1526f1598251857a4d9fd`                                                                                         |
| 本輪文件 review candidate                      | 由本分支 `codex/sr-live-map-001` 最終 commit、PR head 及 canonical `handoff.CANDIDATE_SHA` 鎖定；不把文件 commit 宣稱為已部署版本  |
| map run 的 Actions API `headSha`               | `64b47218ddd1f0c001a1526f1598251857a4d9fd`（workflow 版本，含 tsx 路徑修正）                                                       |
| map artifact 的 `candidateSha` / `headSha`     | 均為 `b35a1f83db378d1668f4c0d85712113a0f9f26d9`（requested checkout）                                                              |
| map artifact 的 `baseSha`                      | `ea1b1b4f0359d5ca5ab00ad604d37281a74d70df`；是 shared recorder 的預設常數，**不是**本輪 fresh base，也不是此次取回所證明的部署基準 |

先 `git fetch origin`，核對本分支無 remote head、PR、鎖定 candidate，才以
`git merge --ff-only origin/dev` 同步。兩個既有 SHA 之間只有
`.github/workflows/live-entry-map-acceptance.yml` 的兩處 tsx invocation 修正；
verifier、map runner、shared recorder、map unit tests 與產品碼均無差異。
本輪不重跑部署、不將舊 SHA 綠燈作為新文件 candidate 的 CI。

## 2. 重新取回的資源與授權

2026-09-30 02:17–02:19 UTC 重新查 GitHub / GCP 中繼資料；没有讀取 secret payload、
改金鑰限制或採購配額。機器快照根目錄：
`/home/lupin/workspace/drts-fleet-platform/.local/sr-live-map-001/20260930/`。
以下稱 `EVIDENCE_DIR`；它是本機重現輔助，遠端 run / artifact 才是可重新下載的 live 證據。

- GitHub `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、`DEV_GCP_REGION=us-central1`。
- ops origin：`https://drts-dev-ops-console-web-r6ykdme3wa-uc.a.run.app`。
- `DRTS_LIVE_MAP_TEST_AUTHORIZED=true`，更新於 `2026-09-30T01:49:32Z`。
- `DRTS_LIVE_MAP_ALLOWED_TARGETS`、`DRTS_LIVE_MAP_TEST_ORIGIN` 均為上述 ops origin。
- `DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS`、`DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL`
  均為 `taipei-main-station-to-xinyi-taipei101`。
- GitHub secrets `GOOGLE_MAPS_GEOCODING_API_KEY`、`GOOGLE_MAPS_ROUTES_API_KEY`、
  `GOOGLE_MAPS_BROWSER_KEY` 均存在，更新時間分別為 `01:49:25Z`、`01:49:27Z`、`01:49:29Z`。
  名稱存在本身不證明 secret 值相同；兩條 hosted rail 成功另證明各自使用的憑證可呼叫 provider。

Secret Manager project number `24645990627`，三個 secret 均只有 version `1`，狀態 `ENABLED`：

| Secret resource（前綴 `projects/24645990627/secrets/`） | 建立時間 UTC                  |
| ------------------------------------------------------- | ----------------------------- |
| `drts-dev-google-maps-geocoding-api-key/versions/1`     | `2026-09-30T00:12:38.739594Z` |
| `drts-dev-google-maps-routes-api-key/versions/1`        | `2026-09-30T00:12:51.610362Z` |
| `drts-dev-google-maps-browser-key/versions/1`           | `2026-09-30T00:13:03.456887Z` |

API key resource 前綴 `projects/24645990627/locations/global/keys/`：

| Key ID（非 key value）                 | 唯一 API restriction               | 其他限制                                                        |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `9c62c774-b1e1-4d7b-b579-bf68373fbcfb` | `geocoding-backend.googleapis.com` | 查得無 browser referrer restriction                             |
| `884813ef-125d-4216-8318-3fad9062841d` | `routes.googleapis.com`            | 查得無 browser referrer restriction                             |
| `d405517c-d45b-438b-aa43-6f4604a18fe2` | `maps-backend.googleapis.com`      | 僅 `https://drts-dev-ops-console-web-r6ykdme3wa-uc.a.run.app/*` |

這是當次設定與可用性證據；未測剩餘配額、壓力容量或長期 SLA。

## 3. Hosted live 證據與實際覆蓋

### 部署 run

[deploy-dev run 36651528649](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36651528649)
於 `00:41:17Z` 建立、`01:05:29Z` 更新完成，九個 job 均 `success`，
run `headSha` 為完整 `b35a1f83…`。
[Deploy services job 109690279481](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36651528649/job/109690279481)
的 `Verify live Google Maps provider` 在 `00:57:03–00:57:05Z` 實際執行成功，非 skipped。
原始 log 有三行 `LIVE_GEOCODING_SMOKE=PASS`、`LIVE_ROUTES_SMOKE=PASS`、
`LIVE_BROWSER_MAPS_SMOKE=PASS`；部署環境列出 `MAP_PROVIDER_MODE=external`。
權威 workflow `.github/workflows/deploy-dev.yml` 的 `api_secrets` 只在三個 secret
同時存在時選 external；該 verifier step 也只在 external 執行。

[Candidate SHA operational acceptance job 109691894426](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36651528649/job/109691894426)
log 顯示 `14 passed (15.5s)` 與 `16 passed (29.0s)`。
這是該部署的 operational journeys 結果，沒有證明下列服務區／位置過期情境。

### Map-only run 與 artifact

[live-entry-map-acceptance run 36658888280](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36658888280)
於 `02:14:06Z` 建立、`02:14:44Z` 完成，
[map job 109709041159](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36658888280/job/109709041159)
成功；entry job 是明確 `skipped`，不列為通過。
workflow 執行的命令為：

```bash
./apps/api/node_modules/.bin/tsx tests/e2e/system-remediation/sr-live-map-001/map-acceptance-runner.ts
```

[Artifact 11073660538](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36658888280/artifacts/11073660538)
名稱 `live-map-acceptance-b35a1f83db378d1668f4c0d85712113a0f9f26d9`，
取回時 `expired=false`、ZIP 1828 bytes。API digest 與下載 ZIP 的 SHA-256 均為
`5a8c18d94bf737656f9c65b51b52b46c7827cd91d2d71e7293d8b609e908dbd7`。

| 檔案                | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `evidence-map.json` | `0c25ebcf4a0140a351fbb65ca4048ba61069f0e3cbe613c4c64df53b9cac21ff` |
| `run-status.json`   | `09ebc5c05eb27141ca04a5a9124c9e5bb04609c78b735b1421d966a1d4441102` |
| `execution-log.txt` | `3c02e58be455c79e0868ec37eb3e1244f2a8d9d4d0c672cb672c559092b8e519` |

讀回 `evidence-map.json`：runId `uat-sr-live-map-001-99e49e9f`，
`02:14:37.937–02:14:38.340Z`，`status=passed`、`exitCode=0`、`errors=[]`，
三個 smoke markers 齊全。`run-status.json` 的 `candidate_sha` / `workflow_sha`
為 `b35a1f83…`，`install_outcome=success`、`runner_outcome=success`、`evidence_present=true`。
`workflow_sha` 是 workflow 環境傳入的 requested SHA，不能冒稱 Actions API 的 workflow head。
checkout step 另以 `git rev-parse HEAD` 核對 exact candidate，該 step 成功。

原始碼 `operations/verification/verify-google-map-provider-live.mjs`：

| Symbol / provider 呼叫                         | 實際 assertion                                                                                                                  | 可宣稱的範圍                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `verifyGeocoding` → Google Geocoding           | 「台北車站」、`language=zh-TW`、`region=tw`；status OK、有結果、lat 21–26.5 / lng 119–123                                       | 單一真實臺灣地標 geocoding smoke；非完整門牌地址矩陣或 DRTS `/geo/resolve` 整合              |
| `verifyRoutes` → `directions/v2:computeRoutes` | 起點 `(25.0478,121.5171)`、終點 `(25.0375,121.5637)`；DRIVE / TRAFFIC_AWARE；distance > 0、duration 符合秒數字串、polyline 非空 | 台北車站至信義區台北 101 一帶的路線／ETA 欄位 smoke；沒有保存實際秒數、距離或驗證 ETA 準確度 |
| `verifyBrowserMap` → Maps JS endpoint          | Referer 為授權 origin；HTTP OK、source > 10000 字元、沒有三種 key/referrer/API 錯誤字串                                         | JS loader HTTP 回應可取回；沒有執行 JS、載入地圖圖磚、操控 pan/zoom 或讀取 GPS               |

`runMapAcceptance` 的 `httpCalls[0]` 是 `method=RUN`、合成 status `200`、
總 subprocess latency `401 ms`，不是實際打到 ops origin 的 HTTP 200，亦不是路線 ETA。
verifier 直接呼叫 Google，不經 `GeoController` / `GeoService`。
artifact 的 `roles=[]` 與 `unimplementedLiveSurfaces=[]` 不代表真機或所有 C114 情境已完成。

## 4. Finding / required_acceptance 對照（§0.7）

文件變更不涉及舊版行為修復，故「舊版失敗 → 新版成功」不適用；保留當前 SHA 的真實結果與未驗邊界。

| Finding／驗收項                              | 原始碼依據與修改位置                                                                                                                                                         | 舊版重現 → 本輪結果                                                                  | 命令、退出碼、執行版本與證據                                                     | 未驗項與具體限制                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configured_map_credentials`                 | `deploy-dev.yml` 的 `api_secrets` / external verifier gate；本文件 §2                                                                                                        | 歷史缺憑證 gate 已有外部證據；本輪 metadata 取回成功                                 | §2 metadata 指令均 exit 0；deploy b35a1f83 step success、map run b35a1f83 exit 0 | 不記新文件 SHA 已部署；未核對 key payload 同一性、剩餘配額或容量                                                                                                 |
| `authorized_location_test`                   | `validateMapRunnerInputs` 的 explicit authorization、origin / route allowlist                                                                                                | 當次 provider 測試授權為 true，map-only profile 成功                                 | `gh variable list` exit 0；run 36658888280 / artifact 11073660538                | 授權範圍為公開地標 provider smoke；未取得／行使真機 GPS、位置資料寫入、服務區測試資源授權                                                                        |
| `map_eta_provider_evidence`                  | `verifyGeocoding` / `verifyRoutes` / `verifyBrowserMap`；本文件 §3                                                                                                           | b35a1f83 三項 smoke pass                                                             | 兩個 hosted run；map `exitCode=0`、三 markers；ZIP digest 已核對                 | **partial**：直接 provider smoke 不包含 DRTS 業務 API、實際渲染、服務區、斷線／過期位置或 ETA 準確度                                                             |
| `live_candidate_sha`                         | deploy workflow、checkout assertion、recorder 的 SHA 來源                                                                                                                    | 已部署與被檢查的 candidate 為 b35a1f83；workflow head 是 64b47218                    | `gh run view`、download、diff 指令 exit 0                                        | 本輪 review candidate 是文件 commit；同 candidate review／CI／merge 仍待 lifecycle 收錄，不能沿用舊 run 結案                                                     |
| MAP-LIVE-GAP-01：服務區正反例                | PRD §6.1 產品規則：區外回 `not_serviceable`；`ServiceAreaController.evaluateServiceArea` → `ServiceAreaService.evaluate` / `evaluateStop`；`ServiceAreaRepository.loadState` | **未執行 live**；provider smoke 沒呼叫 `/service-area/evaluate`                      | 靜態讀碼；無 hosted case / exit code 可列 pass                                   | 必須取回授權 tenant / role、正式 active geometry version 與商品，驗區內／區外臺灣點位、decision / reason codes。不可用 seed 或 fixture 代替已部署資料            |
| MAP-LIVE-GAP-02：位置過期／缺失／斷線        | C114；`location-state.ts` 的 `LOCATION_STALE_MS=10min`、`isFreshLocation` / `getCandidateLocationState`；`ops-map-board.ts` 的 missing 排除與 stale 標記                     | VM-safe 現有 unit tests pass；**live 未驗**                                          | §5 的 33 tests 包含 SR-OPS-MAP 的 18 tests；無裝置／hosted 故障情境              | 正式位置狀態優先於 UI fallback；須授權 driver/location 資源與時間／斷線控制，證明 fresh → stale/missing、實際降級、恢復，綁 candidate、resource ID 與 recordedAt |
| MAP-LIVE-GAP-03：瀏覽器地圖／產品 ETA / 真機 | `GoogleMapBaseLayer`；`GeoController.route` → `GeoService.route`；loader smoke 的能力邊界                                                                                    | loader HTTP pass；產品 UI / GPS 情境 **未驗**                                        | §3 原始 verifier assertions；本機未執行 Playwright                               | hosted browser 必須證明實際渲染／pan/zoom、產品 ETA 與降級；真機定位要另外有授權裝置。現有 14+16 operational tests 不替代此案例                                  |
| MAP-EVIDENCE-01：artifact 基準與合成紀錄     | shared `UatEvidenceRecorder` constructor / `resolveGitHead`；map `runMapAcceptance`                                                                                          | `baseSha` 是 fallback 常數；`headSha` 可來自 CANDIDATE_SHA env；`RUN/200` 是合成結果 | 本文件 §1、§3 保留原值並解釋；workflow checkout step 補強 candidate 核對         | 不修改範圍外 shared recorder；本次 base 以 fresh git 證據為準，不將欄位名解讀為獨立實測                                                                          |

MAP-LIVE-GAP-01/02 是本任務必要 live 證據，選擇依 dispatch 允許方式**如實留未驗**，
沒有宣稱新增子任務或已擴充 runner。這些缺口仍由 `SR-LIVE-MAP-001` 承擔；
Supervisor 負責協調 hosted runner scope／相依與測試身份資源，owner 補測，Claude2 獨立核對。
若要改共享 workflow、正式資料/API 或 shared recorder，先由 Supervisor 核對 scope，
不可在本文件交付時把剩餘工作當作消失。未觀察到可宣稱已重現的產品缺陷；上述是未涵蓋的情境及證據限制。

## 5. 實際指令、退出碼與本機限制

在本輪 base `64b47218ddd1f0c001a1526f1598251857a4d9fd` 執行；Node `v22.23.2`、
pnpm `10.33.0`、Vitest `4.1.4`。後續只改本文件，測試所讀程式與 live b35a1f83 相同。

| 指令                                                                                                                                                                                                                                                                                                                                             | 結果／證據                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`；`git merge --ff-only origin/dev`                                                                                                                                                                                                                                                                                             | 各 exit 0；base 快轉至 64b47218，無 rebase / reset / force push                                                                    |
| `gh variable list --json name,value,updatedAt`（只保存 `DEV_GCP_*` / `DRTS_LIVE_MAP_*`）                                                                                                                                                                                                                                                         | exit 0；`EVIDENCE_DIR/variables.txt`                                                                                               |
| `gh secret list --json name,updatedAt`（只保存 `GOOGLE_MAPS_*` 名稱）                                                                                                                                                                                                                                                                            | exit 0；`github-secret-metadata.txt`                                                                                               |
| `gcloud services api-keys list --project=drts-dev-devcc-20260825 --format='json(name,uid,displayName,restrictions)'`                                                                                                                                                                                                                             | exit 0；`gcp-key-metadata.txt`；不輸出 key value                                                                                   |
| `gcloud secrets versions list <三個完整 secret 名稱逐一> --project=drts-dev-devcc-20260825 --format='json(name,state,createTime)'`                                                                                                                                                                                                               | 各 exit 0；`secret-*-corrected.txt`。首次誤用 `--secret=` exit 2，未讀到資料；改為 positional secret 後成功，保留兩次 command JSON |
| `gh run view 36651528649 --json url,headSha,headBranch,event,conclusion,createdAt,updatedAt,jobs`；同命令查 `36658888280`                                                                                                                                                                                                                        | 各 exit 0；`deploy-run.txt` / `map-run.txt`                                                                                        |
| `gh run view 36651528649 --log`；同命令查 `36658888280`                                                                                                                                                                                                                                                                                          | 各 exit 0；`deploy-log.txt` / `map-log.txt`                                                                                        |
| `gh api repos/ajoe734/drts-fleet-platform/actions/runs/36658888280/artifacts`                                                                                                                                                                                                                                                                    | exit 0；`map-artifacts.txt`                                                                                                        |
| `gh run download 36658888280 --name live-map-acceptance-b35a1f83db378d1668f4c0d85712113a0f9f26d9 --dir "$EVIDENCE_DIR/map-artifact"`                                                                                                                                                                                                             | exit 0；三個檔案皆已讀完                                                                                                           |
| `gh api repos/ajoe734/drts-fleet-platform/actions/artifacts/11073660538/zip > "$EVIDENCE_DIR/map-artifact.zip"`；`sha256sum` ZIP 與三檔                                                                                                                                                                                                          | exit 0；§3 digest 一致                                                                                                             |
| `git diff b35a1f83db378d1668f4c0d85712113a0f9f26d9 HEAD -- operations/verification/verify-google-map-provider-live.mjs tests/e2e/system-remediation/sr-live-map-001/ tests/e2e/system-remediation/shared/ tests/unit/system-remediation/sr-live-map-001/ apps/ops-console-web/app/dispatch/location-state.ts apps/api/src/modules/service-area/` | exit 0、empty diff                                                                                                                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ tests/unit/system-remediation/sr-ops-map-001/`                                                                                                                                                                                                                              | exit 0；2 files / **33 tests passed**（map runner 15、OPS map 18），02:18:37 UTC、462ms；`unit-tests.txt`                          |

沿用已合併的 `.test.ts`（根 Vitest include 規則），不為文件變更新增鏡像 `.spec.ts`。
runner tests 注入 verifier fake，只證 fail-closed、完整 markers、SHA 拒絕及 redaction；
OPS tests 證正式 location / map projection 函式的 unit 行為，不是 live／browser。
task spec 的 `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-map-001`
**未執行**：最新 VM 禁令明確禁止該命令與 browser / E2E server。本機沒有啟動產品服務、
browser、Docker Compose 或任何 billed provider 重跑。

## 6. 交接狀態

文件內容／引用與格式檢查將於最終 commit 前完成並記錄。先普通 push、核對 local / remote / PR
head 一致後，再將最終 `CANDIDATE_SHA`、`CANDIDATE_BRANCH`、PR URL 交給 Claude2。
owner 不寫 `done` 或 `record-acceptance`：四個 required keys 有上述可取回證據及各自限制，
但完整 C114 的服務區、斷線／位置過期與產品／真機情境仍未驗。
本輪沒有部署文件 candidate，同候選 review、CI／merge 與未完成的 live acceptance 都不得冒稱通過。
