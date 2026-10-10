# PAX-FACEBOOK-LOGIN-20261009

Owner: Codex · Reviewer: Codex2

## 正式依據與邊界

- `01_system_sa_sd.md` §2–4：Facebook OAuth2、Graph `/me`、appsecret_proof、FACEBOOK_APP_ID/SECRET 全有全無；既有 OAuth start/callback 與 V0111 transaction。
- `PassengerOAuthService.start/callback`：state digest、一次性 claim、link 綁定帳號；`PassengerAccountService.linkIdentity` 驗證當下 session family。email 不合併帳號。
- SD §3：Facebook 唯一身分刪除視同軟刪帳號；沿用 V0109 `PostgresPassengerAccountTransaction.anonymize/revokeAll`，保留行程／財務資料。
- 僅 stub 外部 provider 與 persistence boundary；不呼叫真實 OAuth，不啟動 VM 服務。

## 本輪修復／驗收證據（持續更新）

初始基準 `2bb31e7fd60074773932caa00a1c56711bb9b6ac`：Facebook 尚未啟用，無 data-deletion callback。尚無前輪退修。

| Finding／驗收項                                  | 原始碼依據與修改位置                                                                  | 舊版重現 → 修正版結果                    | 命令／版本／證據                               | 未驗項與限制                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| pax-facebook_flow_verification_and_data_deletion | facebook-oauth.ts；既有 transaction/account 路徑                                      | 基準功能不存在 → 實作中                  | 待單元驗證                                     | 真實 Meta App／PG／公開 hosted endpoint 待驗 |
| staging/prod webhook 與 status 不可達            | internal-key.middleware.ts + bootstrap-auth.guard.ts activatePassenger(open) 強制 WIF | 靜態證據：Meta 不提供 BFF WIF credential | 已用 progress 請 Supervisor scope coordination | 現 scope 不包含上述兩檔；核准前不修改        |

## Provider 與刪除狀態交付

Graph 端點固定 v24.0。Meta 官方文件此次存取回 429；真實 App 與 Graph 支援情形仍須外部 gate 核實，不能將 stub pass 宣告為 Meta 實測。
狀態回應使用匿名的完成收據，僅在刪除 transaction commit 後簽發，無 Facebook user_id 或帳號資訊；驗證服務不依赖 VM memory。
後续候選、CI／PR、命令與退出碼在本文件更新；handoff 使用實際完整 HEAD，不以文件內前一 commit 冒充候選。
