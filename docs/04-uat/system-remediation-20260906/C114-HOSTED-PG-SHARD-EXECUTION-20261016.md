# C114：既有 PostgreSQL 測試在分片 CI 上執行

原 `fixture-provisioning.postgres.test.ts` 六例只在 `GITHUB_ACTIONS=true` 且 `GITHUB_JOB=unit` 時執行。兩條 CI 改為分片後，真正執行根目錄測試的工作名稱分別為 `product_root_unit` 與 `unit-shard`；integration 的 `unit` 已是結果彙整工作，不再執行該測試。因此舊條件讓六例在兩條 CI 都跳過。

本次只將兩個實際分片工作名稱接入原 hosted 條件，保留舊名稱相容。原六例、全部 assertions、時間上限、隨機隔離資料庫、完整官方 migrations、fixture／裝置註冊／服務寫入及清理流程不變；既有 `DATABASE_URL` 缺失或 migrations 失敗仍是測試失敗。

真正 PostgreSQL 執行證據須取自新候選自己的 GitHub hosted CI artifact，逐一確認原六例通過。一般 VM 檢查仍跳過此套件，不在 VM 啟動 PostgreSQL 或產品服務。本次不改產品功能、身份政策或測試預期，也不以舊版的跳過結果列通過。
