# SD-DP-20261113-001：外部後台帳號密碼登入（與 Google 登入並存）

- `decision_id`: `SD-DP-20261113-001`
- `date`: `2026-11-13`
- `task`: `PORTAL-PASSWORD-LOGIN-SD-20261113`
- `owner`: Claude（本文件）；`reviewer`: Claude2
- `source`: 使用者於 2026-11-13 的 Claude Code 互動對話；逐字依據見
  `/home/lupin/workspace/drts-fleet-platform/.local/portal-password-login-20261113/PORTAL-PASSWORD-LOGIN-SD-20261113.md`
  §0（sha256 `10742c5d2ad1ade3f5bd4aa77d12981b85f2fc77ce0034d74283ddcd99ec643c`）。
- `affected_docs`：本文件、
  [SA/SD](../02-architecture/portal-password-login-20261113/01_system_sa_sd.md)、
  [實作任務包](../02-architecture/portal-password-login-20261113/02_implementation_tasks.md)，以及
  `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md` §7.1 新增的單行參照。

## 1. 背景

2026-08-01 Stage 1.5 計畫 §7.1 寫下「Production human user 不在 DRTS 儲存本地密碼；密碼政策、breached-password detection、recovery 與 MFA 由 approved managed IdP 負責」。這是 `IAM-PLAN-001`（Codex / Gemini2）在撰寫 Stage 1.5 時做出的 AI 設計決定，**並非使用者的明確指示**。使用者於 2026-11-13 得知此設計來源後，做出以下產品決定。

## 2. 使用者 2026-11-13 的五項決定（逐項引用原文意旨，不改寫、不縮減）

以下五項直接對應原 task spec §0 的五個編號條目：

1. **選項 C——Google 與帳密並存**：保留既有 Google 登入（`DEV_OIDC_CLIENT_ID` 照常設定、照常驗收），**另外新增帳號密碼登入**，提供給沒有或不想用 Google 帳號的使用者。這不是取代 Google 登入，兩者長期並存。
2. **適用入口——四個外部後台**：租戶後台（`tenant-console-web`）、企業派車（`enterprise-dispatch-web`）、交通局機關入口（`agency-portal-web`）、車行入口（`fleet-partner-portal-web`）。**平台管理與營運後台（IAP）不在範圍內**——platform/ops realm 的 Cloud IAP + workforce OIDC 路徑不受此決策影響。
3. **環境——dev 與正式環境都要**：不得只在 dev 開啟就視為完成；正式環境必須同樣可用。
4. **兩步驟驗證——驗證器 App（TOTP, RFC 6238）**：Stage 1.5 §7.2 要求 MFA 的角色，在這四個入口使用帳密登入時，必須強制啟用 TOTP 兩步驟驗證。
5. **帳號建立——沿用邀請流程，使用者自設密碼**：使用者點擊邀請信連結後自行設定密碼；**管理員與系統都不經手明文密碼**（不可由管理員代填、代看或透過客服口頭轉達）。

使用者明確指出：「這些是使用者的產品決定，不得在設計中改寫或縮減；若技術上有衝突，寫進決策紀錄的『待使用者決定』段落，不得自行裁決。」本文件與其附帶的 SA/SD、實作任務包均依此原則撰寫；§6「待使用者決定」記錄唯一尚未由使用者定案的衝突點。

## 3. 本決策的限定範圍

本決策**只對上述四個外部入口（tenant-console-web / enterprise-dispatch-web / agency-portal-web / fleet-partner-portal-web，對應 `tenant` / `agency` / `partner` 三個既有 API realm）的 human 使用者日常登入憑證**，取代 Stage 1.5 §7.1 的「Production human user 不在 DRTS 儲存本地密碼」這一條款。具體邊界：

- 四個入口不是四套獨立身分資料庫：租戶後台與企業派車共用既有 `tenant` realm／membership；機關入口沿用 `agency` realm；車行入口沿用 `partner` realm（`packages/tenant-auth`、`packages/agency-auth`、fleet partner portal 經由 `partner/callback-session` 共用 partner realm 的既有 BFF/session 慣例）。本決策新增的是這些既有 realm 的**第二種驗證方式**，不是新 realm、不是新的使用者資料庫。
- **不**影響 `platform`、`ops`（IAP + workforce OIDC）、`driver`（device binding）、`system`（workload identity）、referral passenger（one-time handoff）等其他 realm；這些 realm 的既有「不存本地密碼」與其他 Stage 1.5 政策維持不變。
- **不**取代 Google OIDC 路徑本身；兩者是同一 principal 下並存的兩種登入方式，不得只憑相同 email 自動合併未驗證的身分（詳見 SA/SD §1）。
- Local emergency / break-glass credential（Stage 1.5 §16.1）維持獨立政策，不得被帳密登入取代或混用為日常 fallback。

## 4. §7.1 其他條款繼續有效（未被取代的部分）

Stage 1.5 §7.1 除「不存本地密碼」一句之外，其餘規則對這四個 realm 的帳密登入**同樣適用、沒有放寬**：

- 登入錯誤回應（未知帳號、密碼錯、未受邀、已停用）一律不得透露 email／tenant membership／是否受邀；詳細原因只進 security log（SA/SD §4）。
- invitation token 必須至少 128-bit entropy、hash-only storage、單次使用、24 小時到期；resend 使舊 invitation 失效——帳密登入沿用既有 `TenantInvitationDeliveryService` / `issueTenantInvitation` 機制，沒有新增第二套邀請系統（SA/SD §5）。
- account recovery 不得只靠客服人工改 email；必須由既有 IdP recovery（Google 側）或雙人核准的 identity re-verification 流程處理——帳密側的「忘記密碼」走獨立的、同樣 hash-only／單次／短效的重設流程，且重設後撤銷所有 session，而非客服改 email（SA/SD §6）。

## 5. §7.2 MFA 政策繼續有效（未被放寬）

Stage 1.5 §7.2 逐角色 MFA 表、10／15 分鐘 step-up freshness、「MFA evidence 必須來自可信 IdP claims 或 server-owned device proof，前端 boolean 不得作為依據」全部保留，適用於帳密登入與 Google 登入兩種路徑。帳密登入的 TOTP 驗證結果由 server 寫入與 Google 路徑相同的 `amr`（`otp`/`totp`，即既有 `apps/api/src/common/auth/trusted-mfa.policy.ts` 的 `STRICT_TRUSTED_AMR`），不新增繞過通道、不新增前端宣稱完成 MFA 的欄位。SA/SD §7 列出逐角色 TOTP 強制對應表。

## 6. 待使用者決定（唯一未定事項，不自行裁決）

`docs/02-architecture/bureau-agency-readonly-20261024.md` §8 D2 已記錄「production 是否強制機關角色 MFA」為未決事項：Google 外部帳號的 ID token 是否帶可信 `amr`/`acr` 尚無實測證據，若強制而 IdP 不提供，機關將完全無法登入；該文件明確「本文件不代為決定」。

本決策**不**代替使用者解決 D2，理由：

- D2 討論的是 agency realm 透過 **Google** 登入時的 MFA 可行性問題，與本決策新增的「帳密登入時 TOTP 強制」是兩個獨立問題——本決策的 TOTP 要求（§5）對帳密登入路徑無條件適用，不受 D2 影響。
- 但若 D2 最終決定「production 一般機關角色（非 §7.2 明列的 finance/compliance/audit 等角色）也強制 MFA」，則該角色透過帳密登入時的 TOTP 強制範圍需要與 D2 的結論一致；在 D2 定案前，SA/SD §7 的角色對應表只標註 §7.2 既有明列角色為強制，一般機關角色列為「依 D2 結果調整，不在本決策單方面擴大或縮小」。

除 D2 之外，本決策與其 SA/SD、實作任務包對 §0 五項決定沒有其他衝突或待確認事項。

## 7. 風險與既有 Google 使用者的遷移

- 新增 password verifier、密碼政策、帳號＋IP 速率限制、TOTP 金鑰與復原碼責任都落在 DRTS 自己身上，不能再寫成「已由 Google 處理」。
- 既有只用 Google 登入的使用者要加設密碼，必須先用現有 Google session 完成（若其角色要求 MFA，則需 fresh MFA），或走既有雙人身分復原流程；**不提供自動密碼、不允許只憑 email 做 email-only migration**。
- principal 被停用（`suspended`/`disabled`）必須同時阻止 Google 登入與帳密登入，並撤銷該 principal 既有的所有 session（沿用 Stage 1.5 §9.2 joiner/mover/leaver 的 SLA）。
- 功能關閉（feature flag 關閉某 realm 的帳密登入）只隱藏入口與拒絕新建密碼，不刪除既有密碼/TOTP credential，也不放寬既有驗證規則。

## 8. 交付範圍

本決策紀錄對應 `required_acceptance` key `portal-password-login-sd_decision_and_design_recorded`；連同 SA/SD 一併滿足。可直接登記的實作任務包對應 `portal-password-login-sd_implementation_packet_ready`。本卡**不**包含任何產品程式、migration、UI、hosted/PG/瀏覽器/email/TOTP 的實際操作或驗收證據；這些由實作任務包逐任務執行後才能宣稱完成。owner 不自行結案，需獨立 reviewer（Claude2）審查同一候選、同候選 CI 通過後受保護合併。
