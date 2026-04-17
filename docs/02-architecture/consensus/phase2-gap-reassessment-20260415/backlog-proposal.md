# Proposed Development Plan

## Planning / Governance Items

| ID        | Priority | Type             | 說明                                                                                                                    | Depends On           | 成功定義                                                                  |
| --------- | -------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `P2R-001` | P0       | planning         | 重建 dual-repo current-state gap baseline，將已完成 / 部分完成 / blocked 分開，並標記舊 `phase2-planning` 為 superseded | —                    | 新 baseline 被 supervisor 接受，dashboard / current-work 指向新 workspace |
| `P2R-002` | P0       | planning-blocked | `tenant-commute-hub` annex audit：逐頁盤點 authority、Supabase 殘留、資料來源與 forbidden flows                         | repo B access        | 完成 repo B 頁面 × authority matrix，列出 cutover blockers                |
| `P2R-003` | P0       | planning         | 產出 repo B cutover spec v2：將 page/component/API mapping 對到 core `/api/tenant/*`                                    | `P2R-001`            | 形成可交給 Lovable / external repo 的 page-by-page change spec            |
| `P2R-008` | P1       | planning         | 定義新的 dual-repo completion gate、staging gate、human approval gate                                                   | `P2R-001`, `P2R-003` | 形成 execution promotion 規則與 rollout decision pack                     |

## Execution Candidates — Core Repo

| ID        | Priority | Type               | 說明                                                                                                                                                    | Depends On                      | 成功定義                                                                          |
| --------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `P2R-004` | P1       | execution          | Platform Admin authority completion：補齊 flags / health / quotas / pricing / payments / audit / fleet/users/switchboard 的真 authority 與正確 API 對映 | `P2R-001`                       | Platform Admin 不再依賴模擬資料或錯位 endpoint；每個 page 有明確 authority source |
| `P2R-005` | P1       | execution          | Ops Console breadth completion：dispatch 之外，補足 incidents / complaints / reports / revenue / maintenance / callcenter 的實操作能力與資料來源        | `P2R-001`                       | Host / OpCo / ROC 控制面達到 PRD breadth，至少完成 P0 surfaces                    |
| `P2R-006` | P1       | execution-evidence | staging / smoke / UAT evidence closeout：把現有 rollout pack 轉成真正的 deploy / smoke / UAT 證據                                                       | `P2R-001`                       | checklist 關鍵 pre-flight 勾選完成，留下 smoke / deploy / sign-off evidence       |
| `P2R-007` | P2       | execution-evidence | cross-repo happy-path + audit/billing consistency suite                                                                                                 | `P2R-003`, `P2R-005`, `P2R-006` | 至少有 booking → dispatch → driver → invoice / audit 的整合證據                   |

## 建議執行順序

1. `P2R-001` 先做，先把舊 backlog 清乾淨
2. `P2R-002` / `P2R-003` 平行準備 cross-repo annex 與 cutover spec
3. `P2R-004` / `P2R-005` 作為 core repo 主線
4. `P2R-006` 在 core repo 功能收斂後補齊實際 evidence
5. `P2R-007` / `P2R-008` 收尾成 dual-repo closeout gate
