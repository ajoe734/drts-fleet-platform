# Unattended Voice External Readiness Report

## 1. CTI (Computer Telephony Integration) Readiness

| 項目 | 官方文件 / 預期規格 | 本帳號可用能力 (Readback) | 狀態 | 負責角色 |
|---|---|---|---|---|
| **雙向錄音 (Dual-channel Recording)** | 需支援雙聲道音軌，區分機器與使用者聲音 | 未配置 CTI 帳號，無錄音證明 | 🔴 缺少證據 | 技術/採購負責人 |
| **DTMF 輸入** | 支援可靠的 DTMF tone 擷取與回傳 | 未配置 CTI 帳號，無 DTMF 接收能力證明 | 🔴 缺少證據 | 技術/採購負責人 |
| **通話轉接 (Transfer)** | 支援轉接至真人客服 (Queue/Agent) | 未配置 CTI 帳號，無轉接 API 授權證明 | 🔴 缺少證據 | 技術/採購負責人 |

*Blocker: 缺少真實 CTI 帳號、憑證與 API 存取權限。*

## 2. TWM & 原生語音候選 Readiness

參考資料：
- TWM ASR / TTS 文件 ([即時 ASR](https://drive.google.com/file/d/1qVPH4tCGOLfAv43QU2eQBeh5x1h0niv3/view)、[離線 ASR](https://drive.google.com/file/d/1yHCT3gmJI2aNoeY_dA2V_6vxf4Q9bvFE/view)、[TTS](https://drive.google.com/file/d/1jGU_d-mBTSz4UL1oWaj-I5JeHxXsiroh/view))

| 項目 | 官方文件 / 預期規格 | 本帳號可用能力 (Readback) | 狀態 | 負責角色 |
|---|---|---|---|---|
| **支援模型 (Model/Voice)** | 需支援即時 ASR、離線 ASR、獨立 TTS 聲音 | 尚未授權 API Key，無呼叫紀錄 | 🔴 缺少證據 | 技術/採購負責人 |
| **語言與腔調 (Language)** | 國台語、客語識別與合成 | 未獲取可用語言/腔調列表 | 🔴 缺少證據 | 技術/採購負責人 |
| **配額與併發 (Quota/Concurrency)** | 支援無人語音服務的即時併發需求 | 未取得額度分配與限制說明 | 🔴 缺少證據 | 技術/採購負責人 |
| **候選能力 (Native Voice Candidate)** | 提供一個原生語音候選公平對照 | 未配置其他候選帳號 | 🔴 缺少證據 | 技術/採購負責人 |

*Blocker: 缺少 TWM 測試帳號、API 授權與實際額度確認。*

## 3. 營運準備 (Operational Readiness)

| 項目 | 預期準備內容 | 當前可用資料/證據 | 狀態 | 負責角色 |
|---|---|---|---|---|
| **Line / Brand / 營運商品** | 明確的車隊品牌與可叫車商品對應 | 缺少正式環境商品設定 | 🔴 缺少證據 | 營運負責人 |
| **服務區 (Service Area)** | 地理邊界與營業時間設定 | 缺少服務區地圖或參數設定 | 🔴 缺少證據 | 營運負責人 |
| **值班 Queue & Owner** | 真人例外處理時的佇列設定與負責人 | 尚未建立實體客服佇列分配機制 | 🔴 缺少證據 | 營運負責人 |
| **回撥 SLA (Callback SLA)** | 經乘客同意回撥的時效指標 (例: 90% 60秒內) | 未見營運規章或 SLA 正式宣告 | 🔴 缺少證據 | 營運負責人 |

*Blocker: 缺少正式營運環境的商品、服務區、Queue 設定及 SLA 宣告來源。*

## 4. 資料處理條件與預算 (Data Terms & Budget)

| 項目 | 預期準備內容 | 當前可用資料/證據 | 狀態 | 負責角色 |
|---|---|---|---|---|
| **預算與費率 (Rate/Budget)** | TWM 及 CTI 每分鐘、每百萬字元計費與折扣 | 僅有牌價預估，缺少供應商合約報價 | 🔴 缺少證據 | 採購負責人 |
| **資料處理條款 (Data Terms)** | 個資處理、錄音保存與稽核條款 | 未取得隱私與資料保護同意證明 | 🔴 缺少證據 | 法務/採購負責人 |

*Blocker: 需要採購與法務確認正式費率與資料處理條款。*

## 5. 總結與驗收狀態

**整體狀態：準備報告已產出，但不滿足 required_acceptance，因為缺乏真實帳號及營運設定證據。**

當前無法執行 `UV-EXEC-028` (真實 PSTN 驗證) 及後續 UAT。必須等待相關角色完成採購與環境建置後，提供相關帳號資訊與設定，方可繼續推進。
