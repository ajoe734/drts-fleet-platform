# Consensus Packet — Gap Phase 2 Planning

**狀態：** ACCEPTED（2026-04-17T15:10:00Z）
**起草：** Claude（Supervisor），4 輪 review 後
**日期：** 2026-04-17

---

## 仲裁摘要

| 決策                                                  | 依據                                                | 來源                   |
| ----------------------------------------------------- | --------------------------------------------------- | ---------------------- |
| 取消 GAP-P2S2-009（media upload 獨立任務）            | base64 壓縮限 512KB 可存 DB，不引入 GCS SDK         | Gemini R3              |
| A-1 proof bundle 需微調 contracts（photos: string[]） | base64 方案需要 server-side 驗證                    | Gemini R3 + Copilot R4 |
| G-2 Webhook 狀態問題已解決                            | GAP-P2S1-013 後 sendTestWebhook 回傳真實 httpStatus | Copilot R4             |
| G-3（CI/CD multi-repo）升級為阻斷性                   | Lovable cloud preview 完全失敗                      | Copilot R4             |
| Qwen 任務全部重新分配                                 | Qwen 401 反覆出現，Sprint 2 全面改給 Codex/Codex2   | Copilot R4             |
| GAP-P2S3-001 標記「需人工配合」                       | GCP Console 操作無法自動化                          | Gemini R3              |
| A-1 proof bundle 升為 Sprint 2 P0                     | DA-007/DA-009 UAT 阻斷任務                          | Copilot R4             |
| MISS-002（offline support）→ Phase 3 backlog          | 複雜度過高，不在本次範圍                            | Copilot R4             |

---

## Sprint 2 完整核准 Backlog

### 前置任務（Sprint 2 第一步，必須先完成）

| Task ID       | 標題                                                                          | Owner | 規模 |
| ------------- | ----------------------------------------------------------------------------- | ----- | ---- |
| GAP-P2S2-PREP | driver-app: 安裝 expo-image-picker + expo-location，更新 app.json permissions | Codex | XS   |

---

### Sprint 2 主要任務

| Task ID                | 標題                                                                                    | Owner  | 規模 | 依賴                  |
| ---------------------- | --------------------------------------------------------------------------------------- | ------ | ---- | --------------------- |
| GAP-P2S2-001           | driver-app: trip proof bundle（Expo ImagePicker + base64 壓縮 + CompletionProofBundle） | Codex2 | M    | PREP + contracts 微調 |
| GAP-P2S2-001-CONTRACTS | contracts: CompletionProofBundle.photos: string[]（base64） + server-side 限制          | Codex  | S    | -                     |
| GAP-P2S2-002           | driver-app: trip screen Expo Location metrics（actualDistanceKm/actualDurationSec）     | Codex2 | M    | PREP                  |
| GAP-P2S2-003           | db: V0019\_\_driver_locations.sql migration                                             | Gemini | S    | -                     |
| GAP-P2S2-004           | regulatory-registry: driver location heartbeat endpoint + haversine ETA                 | Codex  | M    | V0019                 |
| GAP-P2S2-005           | driver-app: GPS heartbeat sender（Expo Location backgroundTask，15 秒間隔）             | Codex2 | M    | PREP + GAP-P2S2-004   |
| GAP-P2S2-006           | forwarder: ForwarderAdapterInterface + GrabTaiwanAdapter stub                           | Codex  | M    | -                     |
| GAP-P2S2-007           | api: NestJS SSE endpoint for driver task events（@Sse + EventEmitter2）                 | Codex  | M    | -                     |
| GAP-P2S2-008           | platform-admin: inspect switchboard/page.tsx，回報 gap                                  | Codex  | XS   | -                     |
| G-1                    | tenant-commute-hub: 刪除 supabase/functions/ 資料夾（6 個 edge function）               | Codex  | XS   | -                     |
| G-3                    | tenant-commute-hub: CI/CD multi-repo checkout（Lovable cloud build 修正）               | Codex  | S    | -                     |

---

## Sprint 3 完整核准 Backlog

| Task ID      | 標題                                                                         | Owner         | 規模 | 依賴                 |
| ------------ | ---------------------------------------------------------------------------- | ------------- | ---- | -------------------- |
| GAP-P2S3-002 | ops-console: critical/SOS priority queue view（critical first 排序 + badge） | Codex2        | S    | -                    |
| GAP-P2S3-003 | regulatory-registry: real-time ETA from driver_locations                     | Codex         | M    | V0019 + GAP-P2S2-004 |
| GAP-P2S3-004 | ops-console: SSE dispatch board live updates（EventSource + driver 位置）    | Codex2        | M    | C-1 + GAP-P2S3-003   |
| GAP-P2S3-005 | api: @FeatureGated decorator + NestJS guard                                  | Codex         | M    | -                    |
| GAP-P2S3-006 | db: V0020\_\_settlement_driver_index.sql（純 index，~10 LOC）                | Gemini        | XS   | V0019                |
| GAP-P2S3-007 | forwarder: platform code registry + service bucket enum 擴展                 | Codex         | S    | GAP-P2S2-006         |
| GAP-P2S3-008 | driver-app: settings.tsx → driver-profile API（個人資料區塊）                | Codex2        | S    | GAP-P2S1-004-API     |
| GAP-P2S3-001 | auth: Cloud IAP / OIDC JWT production ⚠️ 需人工 GCP Console 配合             | Gemini + 人工 | XL   | 使用者確認後才能開始 |

---

## 依賴圖

```
GAP-P2S2-PREP（expo packages）
    ├── GAP-P2S2-001（proof bundle）← 需要 GAP-P2S2-001-CONTRACTS 先完成
    ├── GAP-P2S2-002（Expo Location metrics）
    └── GAP-P2S2-005（GPS heartbeat sender）← 需要 GAP-P2S2-004 先完成

GAP-P2S2-003（V0019 migration）
    ├── GAP-P2S2-004（heartbeat endpoint）
    │       └── GAP-P2S2-005（GPS sender）
    │       └── GAP-P2S3-003（real-time ETA）
    │               └── GAP-P2S3-004（SSE dispatch board）
    └── GAP-P2S3-006（V0020 index）

GAP-P2S2-007（SSE task events）
    └── GAP-P2S3-004（SSE dispatch board）

GAP-P2S2-006（ForwarderAdapterInterface）
    └── GAP-P2S3-007（platform code registry）

GAP-P2S1-004-API（進行中）
    └── GAP-P2S3-008（settings driver-profile）

以下可完全平行（無依賴）：
GAP-P2S2-001-CONTRACTS、GAP-P2S2-006、GAP-P2S2-007、GAP-P2S2-008
GAP-P2S3-002、GAP-P2S3-005、G-1、G-3
```

---

## 規模估計表

| 規模 | 意義                |
| ---- | ------------------- |
| XS   | < 1 小時，< 20 LOC  |
| S    | < 4 小時，< 100 LOC |
| M    | 1-2 天，100-300 LOC |
| L    | 3-5 天，300-600 LOC |
| XL   | 1-2 週，架構級      |

---

## 開放問題（Review 後仍未解決）

1. **Qwen token 是否已更新？** 若未更新，Sprint 2 全部任務改給 Codex/Codex2。
2. **GAP-P2S3-001（Cloud IAP）：** 使用者是否願意配合 GCP Console 操作？若不願意，此任務延後至 Phase 3 並維持 `x-drts-internal-key` 方案。
3. **GAP-P2S2-006（Grab Taiwan）：** stub 可先完成，但真正整合需要外部 API 憑證。商務進度？
4. **tenant-commute-hub Lovable 編輯工作流：** G-3 修正後，是否會繼續用 Lovable 線上編輯前端？

---

## 人工確認門（Acceptance Gate）

**使用者必須明確 accept 本 packet 後，supervisor 才會切回 execution mode 並派發 Sprint 2 任務。**

Accept 後將更新：

- `execution_mode` → `supervisor_managed_execution`
- Sprint 2 tasks → `in_progress`（依依賴順序批次派發）
- `discussion_loop.current_owner` → null
