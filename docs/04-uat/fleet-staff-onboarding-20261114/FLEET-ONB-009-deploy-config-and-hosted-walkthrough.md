# FLEET-ONB-009：部署設定與 hosted dev 實機驗收證據

## 已完成（repository 層）

`.github/workflows/deploy-dev.yml` 的 `deploy` job 新增一個在 `Build API env vars` 之前執行的步驟
`Resolve Fleet invitation accept URL`：

- 讀取既有的 repo variable `DEV_FLEET_PARTNER_PORTAL_ORIGIN`（已確認目前 live 值為
  `https://drts-dev-fleet-partner-portal-web-r6ykdme3wa-uc.a.run.app`，projectId
  `drts-dev-devcc-20260825`、region `us-central1`）。
- 缺失或不是裸 HTTPS origin（含 path/空白）時直接 `exit 1`，部署在呼叫 `Deploy — api` 之前就失敗，
  不會部署出一個沒有邀請連結基底的 API 版本。
- 成功時輸出 `base=${DEV_FLEET_PARTNER_PORTAL_ORIGIN}/invite`，由 `Build API env vars` 步驟的
  `FLEET_INVITATION_ACCEPT_URL_BASE` env 繫結讀取，並附加進 API 的 `--set-env-vars`
  字串（`@FLEET_INVITATION_ACCEPT_URL_BASE=<值>`），供
  `apps/api/src/modules/fleet-partner/fleet-invitation-delivery.service.ts` 的
  `buildFleetInvitationEmailBody` 組出邀請信連結。

此寫法仿照既有 `AGENCY_INVITATION_ACCEPT_URL_BASE` 的慣例，但因為
`DEV_FLEET_PARTNER_PORTAL_ORIGIN` 是一個必填的 repo variable（不像 agency portal origin
需要在第一次佈建時從尚不存在的 Cloud Run service 探測），所以採「全有或全無」的硬性檢查：
缺少時直接失敗，而不是略過該環境變數繼續部署。

套用與驗證紀錄見 `.local/FLEET-ONB-009/repo-level-wiring-evidence-20261115.json`：
YAML 解析、`prettier --check`、以及 `tests/unit/deploy-dev-password-login.test.ts`
（本次一併修正其 step-env fixture，加入 `steps.fleet_invitation_url.outputs.base`）
都在這台開發 VM 上以 repository checks 的方式確認通過。

## 尚未完成（external gate，不在本機／本 VM 完成範圍內）

依 AGENTS.md 的 VM 限制，這台開發機只能執行 repository 層檢查（型別、lint、單元測試），
不得啟動產品開發伺服器、瀏覽器測試伺服器或 Docker Compose 基礎設施，也不得在此執行
`playwright test`、`pnpm dev`、`docker compose`。因此以下項目仍待外部（hosted）流程完成，
不可視為本機已完成：

1. 以本卡的 candidate SHA（或其後续被接受的 immutable release/publish 參照）實際觸發
   `deploy-dev.yml`，把 API 與 `fleet-partner-portal-web` 部署到共享 dev（`drts-dev-devcc-20260825`
   / `us-central1`）。
2. 在該次部署之後，於瀏覽器對 live 的 fleet-partner-portal-web / dev API 完整走一次：
   - platform admin 核發邀請（Google 或密碼角色）
   - 受邀者依邀請信連結接受邀請（Google 或密碼）
   - 受邀者登入車行入口
   - 管理者撤銷邀請 / 重寄邀請（撤銷＋重新核發）
3. 收集該次走訪的截圖或 trace、對應的 Cloud Run revision、部署 commit SHA，以及
   FLEET-ONB-003 / FLEET-ONB-004 / FLEET-ONB-007 / FLEET-ONB-008 的 CI 綠燈 run 連結，
   存放於本目錄或 `.local/FLEET-ONB-009/`。

只有在上述三項完成並附上對應證據後，才可記錄 `fleet-onb-009_ready`
（本卡 `required_acceptance` 的唯一 key）。本文件本身不構成該驗收證據，只記錄
repository 層已完成的部分與剩餘的外部閘門範圍。
