# SD-DP-20261114-001：車行入口人員開通（邀請 → Google／密碼登入）

- `decision_id`: `SD-DP-20261114-001`
- `date`: `2026-11-14`
- `status`: `accepted`
- `task`: `FLEET-STAFF-ONBOARDING-SD-20261114`
- `owner`: Claude（本文件）；`reviewer`: Claude2
- `source`: 使用者 2026-11-13 的 Claude Code 互動對話（逐字依據見
  `/home/lupin/workspace/drts-fleet-platform/.local/portal-password-login-20261113/PORTAL-PASSWORD-LOGIN-SD-20261113.md` §0）與
  使用者 2026-11-14 的要求（逐字依據見
  `/home/lupin/workspace/drts-fleet-platform/.local/fleet-staff-onboarding-20261114/FLEET-STAFF-ONBOARDING-SD-20261114.md` §0，
  sha256 `bf63eddb8e5714b7536086ae9889732256b082fc5504b3e5a5861e9f3d1872aa`）。
- `affected_docs`：本文件、
  [SA/SD](../02-architecture/fleet-staff-onboarding-20261114/01_system_sa_sd.md)、
  [實作任務包](../02-architecture/fleet-staff-onboarding-20261114/02_implementation_tasks.md)。

## 1. 背景

[SD-DP-20261113-001](SD-DP-20261113-001-portal-password-login.md) 已針對四個外部入口（租戶後台、企業派車、交通局機關入口、車行入口）記下「Google 與帳密並存、邀請信、使用者自設密碼」的產品決定，並產出 [PORTAL-PASSWORD-LOGIN SA/SD](../02-architecture/portal-password-login-20261113/01_system_sa_sd.md)／[實作任務包](../02-architecture/portal-password-login-20261113/02_implementation_tasks.md)（PWD-LOGIN-001～012）。該 SA/SD §5 寫「agency/partner 側的對應邀請機制同樣沿用」，但這個假設對車行（partner realm 的 `fleet_partner` 業務類型）不成立：車行入口目前沒有任何邀請、綁定或建立身分連結的設計或程式路徑（逐項程式碼依據見 task spec §1，已在本任務以 origin/dev `08d7d95e8` 重新核對，結論不變）。

2026-11-14，使用者在要求完成四個外部後台真實 Google 登入測試（「你都做一做」）的互動中，發現車行入口的登入按鈕一律回 `PARTNER_ENTRY_NOT_FOUND`，無法走通。本任務是補上車行入口的人員開通設計，使 PWD-LOGIN-004/009/012 在車行入口上有一個真正存在的邀請機制可以銜接，而不是繼續假設一個不存在的機制。

## 2. 使用者決定（逐項引用原文意旨，不改寫、不縮減）

1. **2026-11-13（選項 C——Google 與帳密並存）**：四個外部後台都保留既有 Google 登入，另外新增帳號密碼登入；帳號沿用邀請信，使用者自設密碼，管理員與系統都不經手明文密碼。四個入口包含車行入口（`fleet-partner-portal-web`，對應 API `partner` realm）。完整五項決定見 [SD-DP-20261113-001](SD-DP-20261113-001-portal-password-login.md) §2，本決策不重複改寫，僅引用其對車行入口的適用範圍。
2. **2026-11-14（本次要求的來源）**：車行入口已在 shared dev 對外開放並強制登入（PR #3239），使用者要求完成四個入口的真實 Google 登入測試。車行入口目前完全無法完成這個測試，因為沒有任何流程能讓真人 Google 帳號開通——這是本任務存在的直接原因，也是本決策與其 SA/SD、實作任務包要解決的問題範圍。

使用者在 2026-11-13 已明確要求「這些是使用者的產品決定，不得在設計中改寫或縮減；若技術上有衝突，寫進決策紀錄的『待使用者決定』段落，不得自行裁決」。本決策與其附帶文件延續同一原則。

## 3. 明確排除事項

**不得以 referral 乘客同意交接（`partner/ingress/handoff`）作為車行人員開通機制。** 現況程式中唯一會呼叫 `PartnerUserIdentityLinkRepository.resolveOrCreate`（`apps/api/src/modules/tenant-partner/partner-user-identity-link.repository.ts:37-131`）的生產路徑是 `issuePartnerIngressHandoff`（`tenant-partner.service.ts:6561-6620`）與 `POST /api/partner/ingress/handoff`——這是「乘客」透過 referral 夥伴（如物業、銀行）的嵌入頁面建立一次性乘客身分連結的機制，語意是「乘客同意」，不是「車行人員身分核實後開通後台存取」。把兩者混用會讓一個未經核實、原本給乘客用的一次性連結直接具備管理車行營運資料的權限，是嚴重的權限邊界錯誤。本決策與其 SA/SD 設計一套新的、獨立於 referral handoff 的車行人員邀請機制（見 SA/SD §2），`resolveOrCreate` 的既有呼叫方與語意保持不變，不被本決策影響或重用。

**不得只憑 email 自動合併身分。** 與 [SD-DP-20261113-001](SD-DP-20261113-001-portal-password-login.md) §7、[BUREAU-R13](../02-architecture/bureau-agency-readonly-20261024.md) §2.4 一致：接受邀請時的身分綁定必須核對邀請當時鎖定的 email 與 OIDC proof 的 `email_verified`／`email`，不得只用 email 字串相等就合併或啟用一個既有 principal。見 SA/SD §3、§9。

## 4. 本決策的限定範圍

- 本決策只對車行入口（`fleet-partner-portal-web`，API `partner` realm 中 `partnerType === "fleet_partner"` 的業務類型）新增人員邀請、Google／密碼綁定與角色指派的開通流程。
- 不影響既有 `partner` realm 其他業務類型（`referral_channel`、`bank_partner`）的既有 `partner_user_identity_links` 用法與 `issuePartnerIngressHandoff` 流程。
- 不影響 [SD-DP-20261113-001](SD-DP-20261113-001-portal-password-login.md) 對租戶／企業派車／機關入口已定的設計；本決策只是把同一份帳密登入決定，在車行入口缺的那一塊「邀請機制」補齊，使 PWD-LOGIN-004/009/012 在車行入口上有東西可以銜接（見 SA/SD §9、實作任務包的相依說明）。
- 不新增產品程式、migration 或部署設定；本卡只產出決策紀錄、SA/SD 與可登記的實作任務包。
- 本機（VM）不啟動任何服務、瀏覽器、Docker 或資料庫；所有程式碼事實皆由靜態讀碼核對（origin/dev `08d7d95e8`），不透過執行驗證。

## 5. 待使用者決定

本決策與其 SA/SD 對車行人員開通的技術設計（見 SA/SD §1 邀請者與 step-up）沒有需要使用者裁決的衝突：既有 `manageFleetHumanRole`（`fleet-partner.service.ts:211-271`）已將「管理車行人員角色」的權威限定在 `platform`／`ops` realm，本決策的邀請機制延續同一權威模型（platform admin／ops 核發邀請），不是使用者 2026-11-13 五項決定要求的範圍，因此作為技術實作的一致性選擇記錄於 SA/SD，不視為「待使用者決定」。

若日後要開放已登入的 `fleet_partner_admin` 自行邀請同車行的其他人員（自助式邀請），需要另一個獨立的使用者產品決定（涉及誰能授予 `fleet_partner_finance` 等角色的治理問題），本決策不預先開放也不預先關閉，純粹維持現況權威模型不變。

## 6. 交付範圍

本決策紀錄對應 `required_acceptance` key `fleet-staff-onboarding-sd_decision_and_design_recorded`；連同 SA/SD 一併滿足。可直接登記的實作任務包對應 `fleet-staff-onboarding-sd_implementation_packet_ready`。本卡**不**包含任何產品程式、migration、UI、hosted/PG/瀏覽器/email 的實際操作或驗收證據；這些由實作任務包逐任務執行後才能宣稱完成。owner 不自行結案，需獨立 reviewer（Claude2）審查同一候選、同候選 CI 通過後受保護合併。
