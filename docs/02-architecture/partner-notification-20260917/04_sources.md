# Partner Notification Matrix (04_sources.md)

This file contains the test cases matrix for SR-PARTNER-NOTIFY-QA-20260917.

## Source / Case Matrix

- 同 tenant 兩 entry 僅送原 entry
- 跨 tenant 相同 URL 隔離
- 同住戶在兩 App 不串單
- entry 改 tenant 後舊消息不移轉
- link 撤銷停送
- endpoint 停用／輪替重測
- 缺 route 不猜
- 204／HTML200／錯 receipt 拒絕
- partner 已入列但我方 timeout 後 duplicate ack
- ack 後 DB 寫入失敗與 worker lease 到期
- 兩個 worker 競爭
- 五次 maxattempt
- expiresAt
- 改派舊 ETA
- 取消後舊到場
- 缺 driver 情報不洩漏
- 錯 entry／logout 冷啟動點擊
- 未配置不可 available
- 既有一般 tenant webhook C111–C115 回歸

## Evidence
- Pinned candidate SHA: TBD (will be provided upon commit)
- Acceptance status: TBD
- A-level (controlled receiver verified): TBD
- B/C levels: Gated by SR-LIVE-PUSH-001
