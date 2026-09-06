# Unattended Voice External Readiness Report (唯讀盤點供應商與營運準備證據)

- Task ID: `UV-EXEC-027`
- Workstream: `external-readiness`
- External Gate: `true`
- Planning Ref: `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`
- System Design Ref: `docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md`
- Two-Pass Audit Ref: `docs/02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md`
- Execution Runbook: `docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`
- Unblock Diagnosis: `support/unblock/UV-EXEC-027/UV-EXEC-027-UNBLOCK-MANUAL-UNBLOCK.md`
- Decision Ref: `docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md`
- Functional Requirements (FRs): `UV-FR-001`, `UV-FR-003`, `UV-FR-007`, `UV-FR-010`, `UV-FR-011`, `UV-FR-018`, `UV-FR-021`, `UV-FR-024`, `UV-FR-026`, `UV-FR-027`, `UV-FR-030`, `UV-FR-031`, `UV-FR-032`
- Acceptance Criteria (ACs): `UV-AC-002`, `UV-AC-026`, `UV-AC-030`, `UV-AC-033`
- Last Update: `2026-09-06T09:12:34Z`
- Re-Verification: `2026-09-06T09:12:34Z` (acceptance-phase唯讀複查，Claude，二次 acceptance_ready_dispatch 喚醒，較上一輪 09:08Z 無狀態變化)

---

## 1. 執行目標與安全準則 (Objective & Safe Operation)

依據 `UV-EXEC-027` 任務規格與驗收條件：
1. **唯讀核對：** 僅以唯讀方式核對已授權可用 CTI、TWM、原生語音候選接口與帳號 metadata、line/brand/商品/service area、queue owner/SLA、data terms/費率/配額。
2. **零外洩與零越權：** 嚴禁輸出任何秘密金鑰，不申請付費、不發起採購、不對外聯繫供應商；若帳號/電話授權不足，如實記錄缺項與負責角色。
3. **嚴格分欄對照：** 清楚區分「官方文件與協定規格」、「系統架構預期規格 (SA/SD)」、「本帳號可用能力 (Readback 查核結果)」，不混淆外部供應商規格與內部設計需求。
4. **閘門保真：** 營運商品/服務區、值班 queue/回撥 SLA、資料處理條件與預算須有確切來源；未完成前僅產出準備報告，**不滿足 7 項 required_acceptance**，保留具體 blocker，絕不冒充通過。

---

## 2. 查核範圍、時間與環境盤點證據 (Inspection Scope & Empirical Evidence)

於 2026-09-06T04:46:00Z 執行唯讀檢查，界定受權限約束之查核範圍與可重現遮罩證據：

### 2.1 授權查核範圍 (Authorized Inspection Scope)
- **查核範圍限制：** 本機 Worker 隔離工作目錄 (`/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-uv-exec-027`)、本執行行程環境變數、以及程式庫內受版控之 CI/CD 設定檔與公開參考規格。
- **未連線範圍聲明 (Unverified State)：** 受限於唯讀安全規範，本環境未連線存取線上生產/測試營運資料庫 (DB)、集中式機密管理系統 (Secrets Manager) 或第三方供應商管理控制台。因此，線上 DB 之營運商品代碼、地理邊界圍欄、以及集中式話務憑證之客觀狀態標記為**「未驗證／待查核 (Unverified)」**，不可直接推定全組織不存在；但在本工作環境之交付路徑上確實「缺少可用驗證證據 (Missing Evidence)」。

### 2.2 可重現遮罩證據 (Reproducible Redacted Evidence)
1. **行程環境變數查核：**
   - 執行命令：`env | grep -E '^(CTI|TWM|TWILIO|SIP|ASR|TTS|OPENAI|GEMINI_LIVE)'`
   - 查核結果：無任何符合項目，當前行程無預先注入之語音供應商 API 金鑰或 SIP 連線參數。
2. **CI/CD 環境與儲存庫 Secrets 查核：**
   - 查核結果：儲存庫僅配置基礎設施 WIF 金鑰（如 `BUILD_WIF_*`, `DEV_WIF_*`, `PROD_WIF_*`, `STAGING_WIF_*`, `CORE_REPO_PAT`），無 CTI 帳號、TWM 憑證或 PSTN 測試號碼。
3. **Repository Variables 查核：**
   - 僅包含 GCP Project ID 與前端應用 URL，無語音服務端點或電話路由變數。

### 2.3 Acceptance 階段複查記錄 (Acceptance-Phase Re-Verification 2026-09-06T08:32Z)

| 查核項目 | 執行命令 | 查核結果 | 時間戳 |
|---|---|---|---|
| 行程環境語音憑證 | `env \| grep -E '^(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|OPENAI\|GEMINI_LIVE)'` | **[CONFIRMED] No CTI/TWM/Voice credentials in process environment** | 2026-09-06T08:33:18Z |
| GitHub Secrets 語音憑證 | `gh secret list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] No CTI/TWM/Voice secrets in GitHub repository** | 2026-09-06T08:33:23Z |
| GitHub Variables 語音端點 | `gh variable list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] No CTI/TWM/Voice variables in GitHub repository** | 2026-09-06T08:33:28Z |

> **複查結論：** 三項唯讀查核均無新增語音/CTI/TWM 憑證，接受階段外部閘門阻礙狀態未有改變。7 項 `required_acceptance` 仍需外部角色（技術/採購/營運/法務）提供實體憑證方能解鎖。

### 2.4 Acceptance 階段複查記錄 (Acceptance-Phase Re-Verification 2026-09-06T09:08Z, Claude)

| 查核項目 | 執行方式 | 查核結果 | 時間戳 |
|---|---|---|---|
| `dev` 分支推進狀態 | `git fetch origin && git rev-parse origin/dev` | **[CONFIRMED] `origin/dev` 仍停在 merge commit `6adf792381f99783d12c8142bfc69d2c54ad9103`，未推進** | 2026-09-06T09:08:12Z |
| GitHub Secrets 語音憑證 | `gh secret list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] 無符合項目，儲存庫未新增語音/CTI/TWM 秘密** | 2026-09-06T09:08:20Z |
| GitHub Variables 語音端點 | `gh variable list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] 無符合項目，儲存庫未新增語音/CTI/TWM 變數** | 2026-09-06T09:08:25Z |
| 行程環境語音憑證 | `env` / `printenv` 型態指令，逐一比對 `CTI/TWM/TWILIO/SIP/ASR/TTS/OPENAI/GEMINI_LIVE*` 開頭之變數 | **[UNVERIFIED-THIS-SESSION] 本次 worker 執行環境的權限政策將任何比對憑證類變數名稱的指令歸類為需人工核准的高風險操作並自動阻擋執行，本輪未能重跑該項唯讀比對；不可據此推定新增或不存在憑證，僅記錄為本次工具限制** | 2026-09-06T09:08:40Z |

> **本輪複查結論：** `dev` 未推進、GitHub Secrets/Variables 兩項確認無新增語音/CTI/TWM 憑證；行程環境變數比對因本次 session 的權限政策阻擋未能重跑，如實記錄為工具限制而非通過證據。接受階段外部閘門阻礙狀態未有改變，7 項 `required_acceptance` 仍待外部角色提供實體憑證。

### 2.5 Acceptance 階段複查記錄 (Acceptance-Phase Re-Verification 2026-09-06T09:12Z, Claude, 二次 acceptance_ready_dispatch 喚醒)

| 查核項目 | 執行方式 | 查核結果 | 時間戳 |
|---|---|---|---|
| `dev` 分支推進狀態 | `git fetch origin dev && git rev-parse origin/dev` | **[CONFIRMED] 仍停在 `6adf792381f99783d12c8142bfc69d2c54ad9103`，較上一輪 (09:08Z) 無推進** | 2026-09-06T09:11Z |
| GitHub Secrets 語音憑證 | `gh secret list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] 無符合項目，較上一輪無新增** | 2026-09-06T09:12Z |
| GitHub Variables 語音端點 | `gh variable list \| grep -iE '(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|VOICE\|PHONE\|PSTN)'` | **[CONFIRMED] 無符合項目，較上一輪無新增** | 2026-09-06T09:12Z |
| 行程環境語音憑證 | `env \| grep -E '^(CTI\|TWM\|TWILIO\|SIP\|ASR\|TTS\|OPENAI\|GEMINI_LIVE)'` | **[UNVERIFIED-THIS-SESSION] 本輪再次嘗試執行，仍被本次 worker 執行環境的權限政策歸類為需人工核准之高風險操作而阻擋；與上一輪相同的工具限制持續存在，非通過證據** | 2026-09-06T09:12Z |

> **本輪複查結論：** 距上一輪複查僅約 3 分鐘，三項可執行查核（`dev` 分支、GitHub Secrets、GitHub Variables）結果與上一輪完全一致、無新增語音/CTI/TWM 憑證；行程環境變數比對再次被相同權限政策阻擋，如實記錄為持續性工具限制。接受階段外部閘門阻礙狀態未有改變，7 項 `required_acceptance` 仍無真實外部帳號/合約/供應商證據，維持 blocker，未呼叫 `record-acceptance`。

---

## 3. CTI 準備度盤點 (CTI Capability Readiness)

對應 `required_acceptance`: `cti_account_capability_evidence`

| 項目 | 官方文件與協定規格 (Official Specs) | 系統架構預期規格 (SA/SD Specification) | 本帳號可用能力 (Account Readback 查核結果) | 狀態 | 負責角色 |
|---|---|---|---|---|---|
| **雙向錄音 (Dual-channel Recording)** | IETF RFC 7865 / SIPREC 錄音協定標準，或 CTI Media Streams 雙聲道音訊串流 (S16LE PCM / μ-law 8kHz/16kHz) | 依 SA §2.1、SA §8.1/§8.2 與 SD §3.3、SD §8.2，通話派遣前須持久化雙聲道可信錄音片段與不可變索引，區分乘客與 AI 軌道，下單前校驗完整性 | 工作區僅有本地 `SandboxWebhookAdapter`，未配置正式/測試 CTI 帳號與通話端點，無 SIPREC/Media Stream 授權與 Object Storage 錄音儲存桶存取證據 | 🔴 缺少證據 | 技術/採購負責人 |
| **DTMF 輸入接收 (DTMF Inband/Outband)** | RFC 2833 / RFC 4733 (RTP Payload for DTMF Digits) 或 SIP INFO 方法、CTI WebSocket DTMF 事件 | 依 SD §6.2 (確認票據)、SD §8.2 及 SD §11.5 (多語 DTMF 切換)，支援可靠的 inband/outband DTMF 接收與 digit receipt 產生，且敏感數字 (如 OTP) 需具備隔離保護模式 (SD §12.2) | 未配置 CTI 帳號與真實門號 (DID)，無電話線路 DTMF 接收能力 readback 紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **通話轉接 (Call Transfer / Warm Transfer)** | SIP REFER (RFC 3515) 或 CTI Bridge / Warm Transfer API | 依 SA §2.1、SA §8.1 (轉接條件與接手內容) 及 SD §3.3、SD §12.1 (真人交接流程：凍結訂單 mutation、產接手摘要、發起 warm transfer、接通後移交控制權；非 SD §7.6 之自動派遣) | 未配置 CTI 帳號與號碼池，無轉接 API 存取權限與真實通話移交驗證紀錄 | 🔴 缺少證據 | 技術/採購負責人 |

> **CTI 阻礙說明 (Blocker):**
> 缺少正式或測試 CTI 帳號憑證、號碼池與轉接配置，無法完成 `cti_account_capability_evidence`。

---

## 4. TWM 語音 AI 準備度盤點 (TWM Voice AI Readiness)

對應 `required_acceptance`: `twm_account_model_voice_quota_evidence`

參考官方文件依據：
- TWM 即時串流 ASR：[Streaming API V3.22](https://drive.google.com/file/d/1qVPH4tCGOLfAv43QU2eQBeh5x1h0niv3/view) (2026-09-06 核對)
- TWM 離線 ASR：[File inference API V3.4](https://drive.google.com/file/d/1yHCT3gmJI2aNoeY_dA2V_6vxf4Q9bvFE/view) (2026-09-06 核對)
- TWM TTS：[TTS API v2.07](https://drive.google.com/file/d/1jGU_d-mBTSz4UL1oWaj-I5JeHxXsiroh/view) (2026-09-06 核對)
- TWM FAQ：`TWM-ASR-TTS-API-FAQ-32fc62873b44804da250e0b3d53f7c98` (註：review 檢驗指出外連文件重讀失敗，依 SD §11.5 / §16.2 標記歷史數值待正式帳號重驗)

| 項目 | 官方文件規格 (Official Documentation) | 系統架構預期規格 (SA/SD Specification) | 本帳號可用能力 (Account Readback 查核結果) | 狀態 | 負責角色 |
|---|---|---|---|---|---|
| **TWM 即時串流 ASR 模型** | Streaming API V3.22；WebSocket 串流，S16LE PCM 16kHz mono；參數 `minSilenceDurMs`, `maxPacketLossDurSec`, `noSpeechTimeout`；未定義 frame ACK / resume cursor | 依 SD §11.3 與 SD §16.2：首輪即時基準模型為 `myVoca` (國台英辨識)；切換客語使用 `bronci-b3-model-hakka-20260518`；台文逐字稿使用 `bronci-b3-model-taigi-hanzi-20260504` | 尚未配置 TWM API 金鑰或 Token，無 WebSocket 串流握手成功紀錄，無可用 ASR 模型目錄回讀 | 🔴 缺少證據 | 技術/採購負責人 |
| **TWM 離線 ASR 模型** | File Inference API V3.4；提供批次音訊上傳與非即時推論，支援 task/callback 機制 | 依 SA §3.2、SD §11.3 與 SD §16.2：僅用於評測、回查、抽樣質檢與缺漏回補，非即時叫車主流程；候選包含 `bronci-e-model-taigi-20260301`、`Taiwan-Tongues-ASR-CE` (核對大小寫與商務清單)、`bronci-e-model-taigibun-20250814` | 未配置離線 ASR 帳號與權限，無批次推論 API 呼叫與回呼驗證紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **TWM TTS 合成模型** | TTS API v2.07；`voice.model` 由 `/api/v1/tts/models` 動態回傳挑選，嚴禁填寫 ASR 模型名稱；登入路徑依環境核對 (`/api/v1/tts/login`) | 依 SD §11.2 與 SD §16.2：支援 textType=`common`；輸出 HTTP chunked S16LE PCM 16kHz mono 串流；需驗證模型清單，不可將 `myVoca` 誤填為 TTS model | 尚未取得 TTS 帳號與登入憑證，未執行 `/api/v1/tts/models` 查詢，無可用 TTS 模型清單 | 🔴 缺少證據 | 技術/採購負責人 |
| **TWM TTS 語者／聲線 (Voices/Speakers)** | TTS API v2.07 之 `voice.name` (語者代碼)；提供多性別與語者風格宣告 | 依 SD §11.2：固定話術與回讀模板使用 `configured-available-speaker`；需針對門牌、日期、數字與金額執行特定發音規則驗證；各語者在 common textType 下之表現須逐一實測 | 未取得語者目錄 (Voice Catalog)，無授權可用之語者名稱清單，無語者合成品質評測紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **支援語言與腔調 (Languages & Dialects)** | 文件載明支援國語、台灣台語、客語 (四縣、海陸) | 依 SA §3.1、SA §5.1 與 SD §11.3：涵蓋國語 (`cmn-TW`)、台灣台語 (`nan-TW`)、客語 (`hak` 四縣/海陸)；結合引導話術與 DTMF 語言切換；播音需搭配台客語字典與回讀測試，不單憑 `languageCode` 推定翻譯完成 | 未取得 TWM 帳號之可用語言/腔調授權清單與語音樣本 | 🔴 缺少證據 | 技術/採購負責人 |
| **配額與併發限制 (Quota & Concurrency)** | FAQ 提及 POC 15 線基準 (SD §11.5 / §16.2 標註為待重驗數值，不可作為正式 SLA) | 依 SA §10.1 (並發／容量建議以預估尖峰 N 驗證正常負載及 1.5N 突發) 與 SD §13.1、SD §16.2：須取得正式合約宣告之並發通話數、QPS 上限與連線時長門檻 | 未取得正式合約之 QPS/並發配額宣告與正式帳號配額 readback | 🔴 缺少證據 | 技術/採購負責人 |

> **TWM 阻礙說明 (Blocker):**
> 缺少 TWM 授權金鑰、模型目錄查詢、語者清單、語言驗證及正式並發配額，無法完成 `twm_account_model_voice_quota_evidence`。

---

## 5. 原生語音候選準備度盤點 (Native Voice Candidate Readiness)

對應 `required_acceptance`: `native_candidate_account_evidence`

依據 SA §12.1、SD §14.1 與 SD §16.2，為避免將提示詞或工具差異誤算為語音供應商優勢，需提供原生語音候選（Speech-to-Speech）進行公平基準對照。

| 候選方案 | 官方文件規格 (Official Specs) | 系統架構預期規格 (SA/SD Specification) | 架構能力缺項與待驗項目 (Candidate Capability Gaps) | 本帳號可用能力 (Readback 查核結果) | 狀態 | 負責角色 |
|---|---|---|---|---|---|
| **OpenAI Realtime API** | OpenAI Realtime API (WebSocket / WebRTC) 及 Realtime SIP trunking 整合指引 (`developers.openai.com/api/docs/guides/realtime`, `realtime-sip`) | 依 SD §14.1，作為原生雙向語音與共用業務工具之基準對照方案，驗證語意理解與工具調用延遲 | 1. **本土語言能力缺項：** 台語與客語雙向對話能力未經驗證。<br>2. **回讀確定性缺項：** 依 SD §6.2，若原生引擎無法保證精確回讀已驗證文字 snapshot，最後確認輪次必須切換至受控 TTS 或固定錄音拼接。<br>3. **插話協定：** 須驗證 context truncate/cancel 協定 (SD §11.4)，避免模型以為乘客已聽完整句。<br>4. **電話整合：** 需獨立配置 SIP trunk 電信服務。<br>5. **成本與配額：** 音訊 token 計費高昂，尖峰並發額度需專案申請。 | 未配置 OpenAI 組織帳號或具備 Realtime 權限之 API Key，無 SIP trunk 整合端點 | 🔴 缺少證據 | 技術/採購負責人 |
| **Gemini Multimodal Live API** | Google Gemini Multimodal Live API (`ai.google.dev/gemini-api/docs/live-api/capabilities`, `live-api/best-practices`)；WebSocket 雙向雙工串流 | 依 SD §14.1，供另一條原生串流音訊與工具整合之對照路線，比對雙向語音互動與通話穩定度 | 1. **本土語言缺項：** 依 SD §14.1 明示「中文支援不當作台語／客語已驗證」，台客語表現待測。<br>2. **音訊取樣適配：** 入力 16/24kHz、出力 24kHz PCM 與電話 8kHz 轉碼及插話 buffer 清除 (SD §11.4)。<br>3. **確認保護：** 依 SD §6.2 確保回讀內容不發生自由生成幻覺。<br>4. **正式配額：** Live API 正式並發限額與 SLA 待確認。 | 未配置 Gemini Live API 專用存取金鑰與連線環境 | 🔴 缺少證據 | 技術/採購負責人 |

> **原生候選阻礙說明 (Blocker):**
> 缺少原生雙向語音供應商之帳號憑證、SIP 對接配置與本土語言基準評測資料，無法完成 `native_candidate_account_evidence`。

---

## 6. 營運配置準備度盤點 (Operational Readiness)

對應 `required_acceptance`: `line_product_service_area_evidence`, `human_queue_callback_sla_evidence`

| 項目 | 系統架構預期規格 (SA/SD Specification) | 本環境查核結果與可用證據 (Readback Findings) | 狀態 | 負責角色 |
|---|---|---|---|
| **Line / Brand / 營運商品** | 依 SA §3.1 (範圍與開通矩陣)、SA §4 (平台管理員職責)、SA §7 (`UV-FR-026`: 提供入口／商品／語言／供應商／政策版本與開關) 及 SD §4.3 (入口、商品與資源歸屬)，第一階段以普通計程車電話入口為範圍，明確定義專用車隊品牌代碼、服務產線與 Product ID 映射 | 本機工作區無相關靜態設定檔；線上資料庫 (DB) 依查核邊界標記為未驗證 (Unverified)；目前交付路徑缺少正式商品代碼映射設定證據 | 🔴 缺少證據 | 營運負責人 |
| **服務區邊界與營業時間** | 依 SA §3.1、SA §4 (地址與服務區服務責任)、SA §7 (`UV-FR-007`: 地址標準化與服務區核對) 及 SD §4.3、SD §6.4 (地址、服務區與乘車需求的領域映射)，需有正式地理圍欄多邊形 (Geofence GeoJSON / DB 邊界) 及營業時間規則 | 本機工作區無地理邊界定義檔；線上地理資料庫標記為未驗證 (Unverified)；缺少正式服務區多邊形宣告證據 | 🔴 缺少證據 | 營運負責人 |
| **值班隊列與負責人 (Queue & Owner)** | 依 SA §4 (營運/值班責任)、SA §8.1 (轉接條件與接手內容)、SA §8.2 (排隊與無人接聽)、SA §9 (例外工作台與設定) 及 SD §12.1 (真人交接流程：CAS owner 轉為 human，工作台先讀 command receipt)，建立實體客服例外隊列 ID、指定當值 Owner 與移交機制 | 未配置實體真人客服隊列識別 (Queue ID) 與當值人員排班映射；線上隊列狀態標記為未驗證 (Unverified)；缺少值班隊列設定證據 | 🔴 缺少證據 | 營運負責人 |
| **真人接手時效與回撥 SLA** | 依 SA §10.1 (非功能需求初始建議值)：<br>1. **真人值班接手時效：** 建議有人值班時 90% 在 60 秒內開始接手；未達即提供真實等待選項。<br>2. **回撥 SLA：** SA §10.1 **明確規定「回撥 SLA 由入口配置」**，且在 SA §8.2、SA §7 (`UV-FR-021`) 及 SD §12.5 中定義為依話務入口 (line profile) 宣告之獨立營運參數，不可與 60 秒接手指標混為一談。回撥任務寫入 `voice_callback_task.dueAt` 需有明確時效指標來源 | 來源待定 (Pending Source)；未見各話務入口正式公告之回撥 SLA 營運規章或設定檔；線上配置標記為未驗證 (Unverified)；缺少回撥 SLA 承諾來源證據 | 🔴 缺少證據 | 營運負責人 |

> **營運配置阻礙說明 (Blocker):**
> 缺少正式營運商品代碼映射、地理服務區圍欄、真人接手 Queue ID 以及各話務入口宣告之回撥 SLA 來源，無法完成 `line_product_service_area_evidence` 與 `human_queue_callback_sla_evidence`。

---

## 7. 商務費率與資料保護條件 (Commercial Terms & Data Privacy)

對應 `required_acceptance`: `rate_card_capacity_evidence`, `provider_data_terms_evidence`

| 項目 | 系統架構預期規格 (SA/SD Specification) | 本環境查核結果與可用證據 (Readback Findings) | 狀態 | 負責角色 |
|---|---|---|---|
| **商務牌價與預算額度 (Rate Card & Budget Capacity)** | 依 SA §7 (`UV-FR-029`: 成本計算與額度警戒)、SA §9 (設定與發布)、SA §10.2 (每筆有效受理成本) 及 SD §14.3 (成本 ledger 與估算)，明確訂定 TWM 與 CTI 每分鐘通話、百萬字元費用、批量折扣階梯與專案預算上限 | 目前僅有架構設計階段之估算模型假設，缺少供應商簽署之正式報價單、費率卡 (Rate Card) 或採購合約 | 🔴 缺少證據 | 採購負責人 |
| **資料處理條款與訓練排除 (Data Terms & DPA)** | 依 SA §11 (資料、身份與保存：通話音訊與逐字稿不得作為供應商訓練用途、個資落地合規、音訊 180 天與索引 730 天保存政策登錄) 及 SD §9.2 (資料分類與保存)、SD §13.3 (安全與資料邊界)、SD §16.2 (外部依賴清單)，須有正式 DPA | 未取得法務與供應商簽署之資料處理協議 (DPA)、通話錄音保存/銷毀約定，以及嚴格禁止用於模型訓練之法律條款 | 🔴 缺少證據 | 法務/採購負責人 |

> **商務法務阻礙說明 (Blocker):**
> 缺少已簽署之商務合約費率表與資料保護條款 (DPA)，無法完成 `rate_card_capacity_evidence` 與 `provider_data_terms_evidence`。

---

## 8. 驗收結果與閘門狀態總結 (Acceptance & Gate Status)

### 8.1 Required Acceptance 檢驗矩陣

| Required Acceptance Key | 查核結論 | 滿足狀態 |
|---|---|---|
| `cti_account_capability_evidence` | 缺 CTI 帳號、雙向錄音、DTMF 與轉接授權證據 | ❌ 未滿足 (維持 Blocker) |
| `twm_account_model_voice_quota_evidence` | 缺 TWM API Key、ASR/TTS 模型、語者清單與並發配額 | ❌ 未滿足 (維持 Blocker) |
| `native_candidate_account_evidence` | 缺原生語音候選帳號、SIP 對接與本土語言基準評測證據 | ❌ 未滿足 (維持 Blocker) |
| `line_product_service_area_evidence` | 缺營運商品映射代碼與地理服務區圍欄宣告 | ❌ 未滿足 (維持 Blocker) |
| `human_queue_callback_sla_evidence` | 缺真人值班 Queue 代碼與各入口公告之回撥 SLA 來源 | ❌ 未滿足 (維持 Blocker) |
| `provider_data_terms_evidence` | 缺法務簽署之資料處理條款 (DPA) 與模型訓練排除條款 | ❌ 未滿足 (維持 Blocker) |
| `rate_card_capacity_evidence` | 缺正式合約費率卡與容量預算上限承諾 | ❌ 未滿足 (維持 Blocker) |

### 8.2 本任務與下游任務之閘門結論

1. **本工件交付狀態：**
   - 依照 `UV-EXEC-027` 規範完成唯讀盤點，產出完整、客觀且格式嚴格分欄之準備報告。
   - 修正所有 SA/SD 章節引註錯誤（SA 止於第 15 章；更正真人接手時效與回撥 SLA 分野；更正轉接流程為 SD §12.1）。
   - 補齊 TTS 語者 (`voice.name`) 盤點項目，補齊原生語音候選（OpenAI Realtime、Gemini Live）之架構定位與能力缺項分析。
   - 正確界定本機唯讀環境查核範圍，未查核之線上 DB 狀態標記為未驗證，不誇大否定結論。
2. **候選生命週期與外部閘門判定：**
   - **本任務產出之修正準備報告交付審查 (Handoff to Codex)。**
   - **本任務不可直接宣稱 `done`，因七項 `required_acceptance` 尚未取得真實外部授權與合約證據。**
   - 依候選生命週期 (`tools/development-orchestrator/skills/candidate-lifecycle.md`)，本工件經 Review、CI 與 Merge 後，將依 control plane 規則停留在 `acceptance` 階段，保留外部閘門阻礙，等待後續真實外部資源就緒並透過 `record-acceptance` 補齊證據。
3. **下游任務維持阻擋：**
   - `UV-EXEC-028`（真實 PSTN、逐語言、轉接與容量驗證）與 `UV-EXEC-029`（UAT、小量營運開通與回退驗證）必須維持被外部閘門阻擋，待外部證據到位後方可解鎖。
