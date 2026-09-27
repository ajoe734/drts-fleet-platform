# SR-PARTNER-NOTIFY-QA-20260917 — 夥伴通知整合、導航與 UI 的分層驗收

- Task: `SR-PARTNER-NOTIFY-QA-20260917`
- Title: 夥伴通知整合、導航與 UI 的分層驗收
- Status: `in_progress`
- Owner: `Gemini`
- Reviewer: `Codex2`

## 驗收項目
覆蓋 SD §14 全部負向/故障/多租戶案例、NAV身份/handoff/returnTo、管理API/畫面真狀態與手動重試、API restart/claim/fence及唯一retry owner。

已完成自動化測試案例實作，包含以下項目：
1. 同 tenant 兩 entry 僅送原 entry
2. 跨 tenant 相同 URL 隔離
3. 同住戶在兩 App 不串單
4. entry 改 tenant 後舊消息不移轉
5. link 撤銷停送
6. endpoint 停用／輪替重測
7. 缺 route 不猜
8. 204／HTML200／錯 receipt 拒絕
9. partner 已入列但我方 timeout 後 duplicate ack
10. ack 後 DB 寫入失敗與 worker lease 到期
11. 兩個 worker 競爭
12. 五次 maxattempt
13. expiresAt
14. 改派舊 ETA
15. 取消後舊到場
16. 缺 driver 情報不洩漏
17. 錯 entry／logout 冷啟動點擊
18. 未配置不可 available
19. 既有一般 tenant webhook C111–C115 回歸

整合PG由前置PG任務完成並在本整合SHA重驗。
A層controlled_receiver_verified已通過；B/C層保留SR-LIVE-PUSH gate，待真實端點與裝置驗證。

## Evidence
- 新增 E2E 測試與 Unit 測試。
- `.github/workflows/tenant-uat-acceptance.yml` 已配置自動化驗收。
- 源對應文件 `docs/02-architecture/partner-notification-20260917/04_sources.md` 已建立。
