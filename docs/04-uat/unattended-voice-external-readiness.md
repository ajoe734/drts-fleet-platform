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

---

## 1. 執行目標與安全準則 (Objective & Safe Operation)

依據 `UV-EXEC-027` 任務規格與驗收條件：
1. **唯讀核對：** 僅以唯讀方式核對已授權可用 CTI、TWM、原生候選接口與帳號 metadata、line/brand/商品/service area、queue owner/SLA、data terms/費率/配額。
2. **零外洩與零越權：** 嚴禁輸出任何秘密金鑰，不申請付費、不發起採購、不對外聯繫供應商；若帳號/電話授權不足，如實記錄缺項與負責角色。
3. **分欄對照：** 逐項對比「官方文件/架構預期規格」與「本帳號可用能力 (Readback)」。
4. **閘門保真：** 營運商品/服務區、值班 queue/回撥 SLA、資料處理條件與預算須有確切來源；未完成前僅產出準備報告，**不滿足 required_acceptance**，保留具體 blocker，絕不冒充通過。

---

## 2. 環境與金鑰盤點證據 (Empirical Environment Verification)

於 2026-09-06 執行唯讀檢查，確認當前執行環境與儲存空間之憑證狀態：

1. **GitHub Secrets 盤點：**
   - 僅存在平台基礎設施金鑰（`BUILD_WIF_*`, `CORE_REPO_PAT`, `DEV_WIF_*`, `PROD_WIF_*`, `STAGING_WIF_*`, `WIF_*`）。
   - **無**任何 CTI 憑證（如 Twilio / SIP credentials、webhook signing keys）。
   - **無**任何 TWM API 金鑰（如 `TWM_API_KEY`、ASR/TTS 專用憑證）。
   - **無**任何原生語音候選服務帳號。
2. **GitHub Repository Variables 盤點：**
   - 僅包含 GCP Project ID 與前端應用 URL，無語音服務端點或電話路由變數。
3. **行程環境變數盤點：**
   - 無匯出任何 `CTI_*`、`TWM_*` 或 PSTN 測試門號設定。

結論：程式碼庫與 CI/CD 環境目前均無可直接取用之真實供應商帳號或金鑰。

---

## 3. CTI 準備度盤點 (CTI Capability Readiness)

對應 `required_acceptance`: `cti_account_capability_evidence`

| 項目 | 官方文件 / 系統架構預期規格 (SA/SD) | 本帳號可用能力 (Readback 查核結果) | 狀態 | 負責角色 |
|---|---|---|---|---|
| **雙向錄音 (Dual-channel Recording)** | 依 SA §8.2 與 SD §8.2，需支援雙聲道音軌，區分機器 (agent) 與使用者 (passenger) 音軌，支援 SIPREC 或媒體串流分流至可信 recorder 與 object storage | 未配置 CTI 帳號與通話端點，無雙聲道錄音與存儲權限驗證證據 | 🔴 缺少證據 | 技術/採購負責人 |
| **DTMF 輸入接收 (DTMF Inband/Outband)** | 依 SD §6.2/§8.2，支援可靠的 RFC 2833 / SIP INFO DTMF tone 擷取，回傳可信 digit receipt，與音訊 prompt binding 結合 | 未配置 CTI 帳號，無電話線路與 DTMF 接收能力 readback 紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **通話轉接 (Call Transfer / Cold & Warm)** | 依 SA §49 與 SD §7.6，支援轉接至真人客服 (Queue/Agent)，移交通話控制權與上下文標記 | 未配置 CTI 帳號，無轉接 API 存取權限與號碼池授權 | 🔴 缺少證據 | 技術/採購負責人 |

> **CTI 阻礙說明 (Blocker):**
> 缺少正式或測試 CTI 帳號憑證、號碼池與轉接配置，無法完成 `cti_account_capability_evidence`。

## 4. TWM 與原生語音候選準備度盤點 (Voice AI Readiness)

對應 `required_acceptance`: `twm_account_model_voice_quota_evidence`, `native_candidate_account_evidence`

參考資料：
- TWM ASR / TTS 文件 ([即時 ASR](https://drive.google.com/file/d/1qVPH4tCGOLfAv43QU2eQBeh5x1h0niv3/view)、[離線 ASR](https://drive.google.com/file/d/1yHCT3gmJI2aNoeY_dA2V_6vxf4Q9bvFE/view)、[TTS](https://drive.google.com/file/d/1jGU_d-mBTSz4UL1oWaj-I5JeHxXsiroh/view))

| 項目 | 官方文件 / 系統架構預期規格 (SA/SD) | 本帳號可用能力 (Readback 查核結果) | 狀態 | 負責角色 |
|---|---|---|---|---|
| **支援模型 (TWM ASR/TTS Models)** | 依 TWM 規格文件，需支援即時串流 ASR、離線 ASR、獨立 TTS 聲音合成模型；依 SD §11.4/11.5，需支援 silence timeout 與 HTTP chunked stream | 尚未授權 TWM API Key，無模型目錄查詢或 API 連通紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **語言與腔調 (Languages & Accents)** | 依 SA §5.1 與 SD §11.5，需支援國語、台灣台語、客語辨識與合成，支援多語引導與按鍵切換 | 未取得 TWM 帳號之可用語言/腔調授權清單 | 🔴 缺少證據 | 技術/採購負責人 |
| **配額與併發 (Quota & Concurrency)** | 支援無人語音服務的即時並發需求（目標 N 路並發，無人呼叫尖峰吞吐） | 未取得正式合約之 QPS/concurrency 限額設定與配額宣告 | 🔴 缺少證據 | 技術/採購負責人 |
| **原生語音候選 (Native Voice Candidate)** | 依 `UV-EXEC-026` 與 runbook §4，需提供一個原生語音候選進行公平基準對照 | 未配置次要語音候選之供應商帳號或 API 憑證 | 🔴 缺少證據 | 技術/採購負責人 |

> **語音 AI 阻礙說明 (Blocker):**
> 缺少 TWM 與原生候選供應商之正式授權金鑰、模型開通確認及並發額度，無法完成 `twm_account_model_voice_quota_evidence` 與 `native_candidate_account_evidence`。

---

## 5. 營運準備度盤點 (Operational Readiness)

對應 `required_acceptance`: `line_product_service_area_evidence`, `human_queue_callback_sla_evidence`

| 項目 | 預期準備內容 (SA/SD 規格) | 當前可用資料 / 證據 | 狀態 | 負責角色 |
|---|---|---|---|---|
| **Line / Brand / 營運商品** | 依 SA §96/§199，明確定義無人語音叫車專用之車隊品牌、服務產線與商品類型 (Product ID) 映射 | 資料庫與設定檔中尚未配置語音叫車專屬營運商品代碼 | 🔴 缺少證據 | 營運負責人 |
| **服務區 (Service Area)** | 依 SA §239，明確設定營運地理邊界 (Geofence boundaries) 與營業時間規則 | 缺少正式服務區邊界定義檔或資料庫地理多邊形記錄 | 🔴 缺少證據 | 營運負責人 |
| **值班 Queue & Owner** | 依 SA §239 與 SD §7.6，建立真人客服例外處理隊列 ID、指定當值 Owner 與移交機制 | 尚未建立實體真人客服隊列識別與分流指派機制 | 🔴 缺少證據 | 營運負責人 |
| **回撥 SLA (Callback SLA)** | 依 SA §247 與 SD §6.4，經乘客同意回撥之時效指標（例：90% 來電於 60 秒內由真人或系統回撥） | 未見正式公告之營運規章或客服 SLA 承諾來源 | 🔴 缺少證據 | 營運負責人 |

> **營運配置阻礙說明 (Blocker):**
> 缺少正式營運商品、地理服務區、真人接手 Queue 及回撥 SLA 宣告來源，無法完成 `line_product_service_area_evidence` 與 `human_queue_callback_sla_evidence`。

---

## 6. 商務費率與資料保護條件 (Commercial Terms & Data Privacy)

對應 `required_acceptance`: `rate_card_capacity_evidence`, `provider_data_terms_evidence`

| 項目 | 預期準備內容 (SA/SD 規格) | 當前可用資料 / 證據 | 狀態 | 負責角色 |
|---|---|---|---|---|
| **預算與費率 (Rate Card & Capacity)** | 依 SA §238/§247，TWM 及 CTI 每分鐘通話、每百萬字元合成與辨識之計費牌價、批量折扣與預算上限 | 僅有設計階段之估算假設，缺少供應商正式報價單或採購合約費率表 | 🔴 缺少證據 | 採購負責人 |
| **資料處理條款 (Data Terms & DPA)** | 依 SA §293/§297，個資處理協議 (DPA)、通話錄音保存年限、資料落地限制與供應商訓練排除條款 | 未取得供應商簽署之資料處理協議與錄音不作為模型訓練用途之法律條款 | 🔴 缺少證據 | 法務/採購負責人 |

> **商務法務阻礙說明 (Blocker):**
> 缺少已簽署之商務合約費率表與資料保護條款 (DPA)，無法完成 `rate_card_capacity_evidence` 與 `provider_data_terms_evidence`。

---

## 7. 驗收結果與閘門狀態總結 (Acceptance & Gate Status)

### 7.1 Required Acceptance 檢驗矩陣

| Required Acceptance Key | 查核結論 | 滿足狀態 |
|---|---|---|
| `cti_account_capability_evidence` | 缺 CTI 帳號、雙向錄音、DTMF 與轉接授權證據 | ❌ 未滿足 |
| `twm_account_model_voice_quota_evidence` | 缺 TWM API Key、ASR/TTS 模型授權與並發配額 | ❌ 未滿足 |
| `native_candidate_account_evidence` | 缺原生語音對照候選帳號與憑證 | ❌ 未滿足 |
| `line_product_service_area_evidence` | 缺營運商品映射與服務區地理範圍宣告 | ❌ 未滿足 |
| `human_queue_callback_sla_evidence` | 缺真人值班 Queue 代碼與回撥 SLA 來源 | ❌ 未滿足 |
| `provider_data_terms_evidence` | 缺法務簽署之資料處理條款 (DPA) | ❌ 未滿足 |
| `rate_card_capacity_evidence` | 缺正式合約費率卡與容量預算 | ❌ 未滿足 |

### 7.2 本任務與下游任務之閘門結論

1. **本工件完成狀態：**
   - 依照 `UV-EXEC-027` 規範完成唯讀盤點。
   - 分欄對照官方規範與本帳號可用能力，逐項列出負責角色與欠缺證據。
   - 不偽造通過、不輸出秘密，產出完整準備報告工件。
2. **生命週期與外部閘門判定：**
   - **本任務產出之準備報告可交付審查 (Handoff to Codex)。**
   - **本任務不可直接宣稱 `done`，因七項 `required_acceptance` 尚未取得真實外部證據。**
   - 依候選生命週期 (`tools/development-orchestrator/skills/candidate-lifecycle.md`)，本工件經 Review、CI 與 Merge 後，將依 control plane 規則停留在 `acceptance` 階段，等待真實帳號金鑰與營運設定完成後，透過 `record-acceptance` 補齊證據方能達成 `done`。
3. **下游任務阻擋：**
   - `UV-EXEC-028`（真實 PSTN、逐語言、轉接與容量驗證）與 `UV-EXEC-029`（UAT、小量營運開通與回退驗證）必須維持被外部閘門阻擋，待上述外部證據到位後方可解鎖。
