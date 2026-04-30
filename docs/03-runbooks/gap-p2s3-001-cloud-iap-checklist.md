# GAP-P2S3-001 Cloud IAP / OIDC Unblock Checklist

## Purpose

This runbook turns the current `GAP-P2S3-001` blocker into an executable checklist.
It separates the work into:

- **D-0 manual / infra provisioning**: human-operated GCP / IAM / secret / IAP setup
- **D-1 repo implementation**: code, workflow, test, and verification changes inside this repository

Use this document as the closeout record for the staged internal
control-plane auth migration and the remaining fallback-policy decisions.

Execution anchor:

- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md`

## Current Block

`GAP-P2S3-001` is no longer blocked and is now closed on the protected staging
path for the internal control-plane web surfaces.
The remaining residuals are limited to explicit local/direct-API fallback
handling policy and historical documentation cleanup.

- The accepted planning packet marks the task as `Gemini + 人工` and says user confirmation is required before work starts.
- The IAP-protected load-balancer path is now established for the internal control-plane API and web surfaces, and staging deploy defaults are aligned to that protected path.
- The current API runtime still retains bootstrap headers plus `x-drts-internal-key` as an explicit local/direct-path fallback, but protected control-plane web traffic no longer depends on browser-supplied bootstrap identity.
- Repo-side groundwork is now materially in place: the API accepts verified Bearer JWTs, tenant bootstrap sessions now carry `authMode: jwt_bearer` consistently, the protected `platform-admin-web` / `ops-console-web` proxy routes now mint server-issued inner Bearer auth, and GitHub Actions health-check verification now mints an IAP ID token directly instead of relying on the broken `gcloud ... --audiences` path.
- Verified on `2026-04-24`:
  - branch staging deploy run `#24890119736` completed successfully
  - `https://staging.drts-fleet.cctech-support.com/control-plane-proxy/identity/context` returned `200`
  - `https://ops.staging.drts-fleet.cctech-support.com/control-plane-proxy/identity/context` returned `200`
  - `platform-admin` proxy reads for users / tenants / public-info / fleet returned `200`
  - `ops-console` proxy reads for identity / drivers returned `200`

Observed operator probe on `2026-04-24`:

- The current workspace is pointed at GCP project `autotaxi-492811`.
- Human interactive `gcloud auth login` for `edna@cctech-support.com` is now complete, so repo automation is no longer blocked on the VM-scoped compute credential.
- The active non-interactive `gcloud` principal was previously `1071409254673-compute@developer.gserviceaccount.com`, which could not inspect Cloud Run / Secret Manager state because the issued token returned `ACCESS_TOKEN_SCOPE_INSUFFICIENT`.
- Concrete D-0 values confirmed from GCP:
  - project: `autotaxi-492811`
  - region: `us-central1`
  - protected staging hosts: `https://staging.drts-fleet.cctech-support.com`, `https://ops.staging.drts-fleet.cctech-support.com`, `https://api.staging.drts-fleet.cctech-support.com`
  - IAP audience / client id: `1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
  - IAP accessor baseline: `domain:cctech-support.com`
  - CI / deploy verifier principal additionally granted: `serviceAccount:github-actions-deployer@autotaxi-492811.iam.gserviceaccount.com`
- Runtime split confirmed:
  - internal control-plane hosts are routed through the external HTTPS LB + IAP
  - tenant portal still uses the direct Cloud Run API URL and is therefore outside the default IAP boundary
- Remaining external propagation caveat:
  - the original multi-host managed TLS certificate `drts-ssl-cert-v2` remained stuck at `PROVISIONING / FAILED_NOT_VISIBLE`, so a replacement certificate `drts-ssl-cert-v3` was issued and attached to `drts-https-proxy`.
  - as of `2026-04-24`, `api.staging...` and `ops.staging...` are already presenting the new multi-SAN certificate and pass normal TLS validation even while Google still reports the replacement certificate as `PROVISIONING`.
  - `staging.drts-fleet.cctech-support.com` remains safely served by the original single-domain managed certificate, so there is no live certificate mismatch on the admin host.

## Accepted Topology

`GAP-P2S3-001` now follows an accepted staged rollout model:

1. Stage 0: API OIDC / Bearer readiness without changing ingress.
2. Stage 1: internal control-plane API protection first.
3. Stage 2: internal control-plane web surfaces second.
4. Stage 3: tenant portal remains application-auth-first by default.
5. Stage 4: driver, partner-adapter, and webhook paths must not depend on IAP.

## Human Fast Path

If someone needs the shortest possible unblock path, do these first:

1. Confirm the exact **GCP project**, **region**, and **Cloud Run service** covered by `GAP-P2S3-001`.
2. Confirm the Stage 1 / Stage 2 cutover scope for the internal control-plane path before enabling IAP.
3. In **GCP Console**, enable **Cloud IAP for the target internal control-plane service path** and finish the required OAuth / IAP app setup.
4. Keep tenant / driver / adapter / webhook paths outside that default IAP boundary.
5. Record the **expected audience / client id** that the protected internal path must verify.
6. Grant the CI / staging caller the IAM access it needs to call the protected service and obtain the right token.
7. Hand the repo team these concrete inputs: protected service scope, audience / issuer assumptions, and any required env vars / secrets.

Once those seven items are done, the repo-side `D-1` work can move from blocked planning into implementation.

## GCP Console 操作版

這一段是給實際要進 GCP Console 操作的人看的，目標是把 `GAP-P2S3-001` 從「外部 blocker 未解」推進到「repo 可以開始做 `D-1`」。

### 1. 先確認目標服務

- [x] 確認這次要保護的是哪個 GCP project。
- [x] 確認 region。
- [x] 確認 Stage 1 要先保護哪些 internal control-plane API / ingress path。
- [x] 確認 Stage 2 是否同時納入 `platform-admin-web` / `ops-console-web`。
- [x] 確認 `tenant-commute-hub`、Driver App、partner adapters、webhook callbacks 不在預設 IAP 邊界內。

### 2. 在 GCP Console 啟用 Cloud IAP

- [x] 打開 GCP Console。
- [x] 進入 **Security / Identity-Aware Proxy**。
- [x] 找到對應的 Cloud Run 服務。
- [x] 啟用 IAP 保護。
- [x] 如果系統要求先完成 OAuth consent screen 或 IAP app 設定，就在這一步完成。

### 3. 記錄 repo 端一定會用到的值

- [x] 記下 IAP / OAuth 對應的 **client id / audience**。
- [x] 確認 repo 端應該驗哪個 issuer。
- [x] 如果有固定允許的 caller identity，也一起記錄。
- [x] 把這些值整理成可交接的文字，不要只停留在 Console 畫面。

### 4. 補齊 CI / staging 呼叫權限

- [x] 確認 GitHub Actions 或 staging 驗證流程最後是用哪個 principal 呼叫受保護服務。
- [x] 給這個 principal 足夠的 IAM 權限，讓它能合法取得 token 並呼叫服務。
- [x] 確認這條呼叫路徑未來可以用在 deploy 後 health-check、smoke、或 E2E。

### 5. 回填給 repo 實作端

- [x] 明確告知 repo 實作端：project、region、service scope。
- [x] 明確告知：audience / client id、issuer、允許 caller。
- [x] 明確告知：還需要哪些 env vars / secrets。
- [x] 如果這一波只切 internal control-plane API，也明講；如果 Stage 2 要同時納入 internal web surfaces，也明講。

### 完成判定

做到這裡就表示：

- 人工 GCP Console 前置已經不再是模糊 blocker
- repo 端已經拿到足夠資訊，可以開始做 `D-1`
- `GAP-P2S3-001` 已不再是人工前置未解的 blocker，後續僅保留 closeout 與 fallback policy 記錄

## Desired End State

`GAP-P2S3-001` is only ready for closeout when all of the following are true:

1. Cloud IAP and the required GCP-side prerequisites are configured.
2. The internal control-plane path verifies Bearer tokens / OIDC assertions instead of treating bootstrap headers as the production trust model.
3. Tenant, driver, partner, and webhook flows still use their intended non-IAP auth boundaries.
4. Staging deploy and health verification reflect the new staged auth surface.
5. Smoke / E2E / ops docs no longer describe bootstrap-header auth as the default production path.

## D-0 Manual / Infra Provisioning Checklist

These items require a human with the right GCP access.

### Project / Access

- [x] Confirm the target GCP project, region, and Cloud Run services covered by this migration.
- [x] Confirm who owns GCP Console execution for Cloud IAP enablement.
- [x] Confirm the runtime service account and GitHub WIF deployer identity that staging uses today.

### Cloud IAP Setup

- [x] Enable Cloud IAP for the target internal control-plane service path(s). _(Enabled and routed for API + internal web surfaces; replacement managed certificate is already being served on `api.staging...` / `ops.staging...`.)_
- [x] Complete the required OAuth consent screen / IAP app configuration.
- [x] Confirm the expected audience / client id that the API should trust.
- [x] Confirm the staged order instead of a universal cutover: internal control-plane API first, internal web surfaces second, tenant / driver / partner / webhook paths excluded by default.

### IAM / Token Path

- [x] Confirm which principal is allowed to call the protected service in CI / staging verification.
- [x] Grant the required IAM roles so GitHub Actions or the designated verification identity can mint or obtain the needed token.
- [x] Confirm the service-to-service path used by smoke / E2E and health checks after migration.

### Secrets / Vars / Environment

- [x] Provision any required env vars / secrets for JWT audience, issuer, or allowed identity configuration.
- [x] Confirm whether JWKS discovery is sufficient or whether additional secret material is required.
- [x] Record the exact staging values or references the repo implementation should read.

### Manual Evidence To Capture

- [x] Cloud IAP enabled screenshot or equivalent operator evidence.
- [x] OAuth / IAP application identifier and expected audience value.
- [x] IAM grant confirmation for the CI / verification principal.
- [x] Final list of env vars / secrets the repo work may assume exist.

## D-1 Repo Implementation Checklist

These items can proceed once D-0 is clear enough to give the repo concrete inputs.

### API Runtime

- [x] Introduce the JWT / OIDC verification path for protected API traffic.
- [x] Keep caller-type separation explicit so tenant / driver / partner / webhook traffic does not inherit an admin-only IAP assumption. _(Protected control-plane hosts are the only default IAP targets; tenant, driver, partner, and webhook paths stay on their own auth boundaries.)_
- [x] Stop treating free-form bootstrap actor headers as the production trust path. _(Protected `platform-admin-web` / `ops-console-web` now derive caller identity from the IAP-authenticated request and issue server-owned inner Bearer auth; legacy bootstrap helpers remain only for local dev or direct non-IAP diagnostics.)_
- [x] Document whether `x-drts-internal-key` remains as local-only / break-glass fallback or is removed from staging. _(`x-drts-internal-key` remains a local/direct-path fallback only; it is not part of the protected staging control-plane default path.)_
- [x] Keep health or other approved public exceptions explicit and narrow. _(Health checks remain intentional exceptions; protected control-plane API verification now proves the authenticated path separately.)_

### Deployment / CI

- [x] Update `.github/workflows/deploy-staging.yml` so the protected service no longer relies on `--allow-unauthenticated`.
- [x] Scope the protected ingress to the internal control-plane path only; do not force tenant / driver / webhook traffic behind the same boundary.
- [x] Add or update the GitHub Actions auth flow used to obtain the required token for verification.
- [x] Make health / post-deploy verification prove the new auth surface, not just Cloud Run readiness.

### Tests / Verification

- [x] Add positive verification for valid Bearer token / assertion acceptance.
- [x] Add negative verification for invalid, missing, or wrong-audience token rejection.
- [x] Update smoke / E2E helpers so the default staging path no longer assumes bootstrap headers. _(Protected control-plane verification now mints IAP tokens directly; bootstrap identity remains documented only for local/direct-path diagnostics.)_
- [x] Keep any temporary fallback behavior explicitly documented if migration is phased.

### Docs / Operations

- [x] Update `tests/smoke/README.md` and any related operational notes to describe the new auth flow.
- [x] Record how engineers or CI obtain the token needed for smoke / E2E. _(Service-account impersonation must include the `email` claim for IAP acceptance.)_
- [x] Update any rollout or recovery notes affected by the auth change.

## Recommended Execution Order

1. Finish **D-0** manual prerequisites and capture the operator evidence.
2. Freeze the concrete runtime values the repo needs: audience, issuer, caller identity, and service scope.
3. Implement **API runtime** changes.
4. Implement **deploy / CI** changes.
5. Update **tests / smoke / E2E**.
6. Update **docs / ops**.
7. Run targeted verification and attach evidence to the task closeout.

## Suggested Evidence Bundle

When this blocker is finally cleared, the handoff or review summary should include:

- D-0 operator evidence reference
- exact Cloud IAP audience / issuer assumptions
- repo diff summary
- verification commands run
- positive auth verification evidence
- negative auth verification evidence
- deploy / post-deploy verification evidence

## Exit Criteria

`GAP-P2S3-001` moved out of `blocked` on `2026-04-24` when:

- D-0 had named human ownership and completed prerequisites
- the repo had concrete auth inputs to implement against
- the next critical path step became repo implementation rather than GCP Console work

`GAP-P2S3-001` can move to `done` only when:

- the manual GCP / IAP gate is complete
- the repo implementation is merged and verified
- staging verification uses the new auth path
- bootstrap-header trust is no longer the claimed protected-control-plane production mechanism

`GAP-P2S3-001` is now considered `done` for the protected internal
control-plane path because those four conditions are met on remote `main` and
verified by staging deploy run `#24891433989`.

## Repo Anchors

- `.github/workflows/deploy-staging.yml`
- `docs/03-runbooks/auth-plane-separation-matrix.md`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/common/auth/auth.matrix.ts`
- `apps/api/src/common/auth/internal-key.middleware.ts`
- `apps/api/src/common/auth/auth.types.ts`
- `apps/api/src/app.module.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `tests/e2e/lib/helpers.sh`
- `tests/smoke/README.md`
- `support/sidecars/GAP-P2S3-001/GAP-P2S3-001-SIDECAR-ACCEPTANCE.md`
