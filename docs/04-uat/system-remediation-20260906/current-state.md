# SR-READINESS-001 當前版本準備盤點

觀察時間：2026-09-08T15:13:15.708239+00:00。Base / tested product SHA：`c4c4a35f88907df6bf68e781059dde397c06ba03`。

44 個 issue 均有目前版本的 source blob 與追溯任務；134 項能力逐項列出角色、資料需求、場景、供給 owner 與讀回方式，詳見 [readiness.json](readiness.json)。來源檔案 SHA-256 與合併 PR SHA 也保留在 JSON。

本機相關回歸 212 passed / 0 failed / 0 skipped。這不是 44 個 issue 全數重現通過；沒有對應回歸的項目明列 reproduction missing。有合併 PR 也不推導已部署或 live pass。未發現需要本任務新增業務修復子任務的失敗回歸；既有未驗收項目沿用原 task_ids。

正式入口沿用 SR-PUBLIC-001 的 fleets / ops / partners / dispatch / bank / channel / tenant / refer / api.smarttransport.tw 清單；來源見 [SR-PUBLIC-001](SR-PUBLIC-001.md)。該報告的 TLS/部署結果是歷史證據，本次未重新連線。PR #1710 的部署入口收斂及 PR #1759 的公開入口準備工作已合併，不能據歷史 TLS 失敗重開公開暴露。IAP 合法角色、SSO/MFA 與 deployed SHA 仍需環境/IAM 管理員提供讀回。

測試身份沿用 SR-UAT-HARNESS-001 的 role-personas 與 IAM policy catalog；persona 中的固定 actor/tenant ID、example 信箱及 synthetic headers 僅供 local/sandbox，不是正式帳號或已 provision tenant。各能力 resource_ids 為空，代表本次沒有可驗證 live ID。需 IAM 管理員及 harness owner 提供兩個隔離 tenant、合法角色/scopes 與正反向授權資料。

## 外部條件

| Gate                | 提供者                                                         | 缺少證據                                                                 | 讀回方式                                                                                                            |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| SR-LIVE-ENTRY-001   | 環境管理員 + IAM 管理員（task owner: Codex）                   | 授權環境變更、公開 DNS/TLS、IAP/SSO/MFA 角色帳號、部署 SHA               | 唯讀讀回 DNS/TLS 與部署 revision；授權帳號從正式入口登入並核對 realm/角色與 candidate SHA。                         |
| SR-LIVE-MAIL-001    | 郵件服務管理員 + 授權信箱持有人（task owner: Claude）          | 測試信箱授權、provider 設定 reference、message ID 與送達回執             | provider console/API 讀回 message ID、狀態與 recipient receipt；對齊 outbox/invitation/approval ID。                |
| SR-LIVE-PUSH-001    | 行動端負責人 + push provider 管理員（task owner: Gemini）      | 授權真裝置、provider account reference、裝置送達證據                     | provider message ID 對齊 order/event ID；真裝置讀回收訊時間與前景/背景狀態。                                        |
| SR-LIVE-DOC-001     | 儲存管理員 + 銀行簽章管理員（task owner: Codex2）              | storage/signer 授權 reference、受控 bytes、正式公鑰與簽章                | 合法角色下载同 artifact ID；獨立工具核對 bytes SHA-256/公鑰簽章，跨角色拒絕及到期失效。                             |
| SR-LIVE-FINANCE-001 | 財務/issuer/ERP sandbox 管理員（task owner: Claude2）          | 隔離 financial sandbox、issuer eligibility receipts、付款恢復與對帳資料  | 以 sandbox transaction/eligibility ID 查 provider receipt，再查平台 ledger/statement 同 ID 與金額。                 |
| SR-LIVE-MAP-001     | 地圖 provider 管理員 + 授權定位測試人員（task owner: Gemini2） | 受限 map credential reference、定位測試授權、route/ETA provider evidence | provider project 配額/限制 metadata 與 route request ID；對齊座標時間、路線與 ETA。                                 |
| SR-LIVE-DRIVER-001  | 行動端負責人 + Android/iOS 測試裝置持有人（task owner: Codex） | 兩平台授權真機、native build SHA、背景/離線/SOS 證據                     | 讀回 build ID、device reference、assignment/trip/event ID 與重連後 API 狀態。                                       |
| SR-LIVE-FORWARD-001 | 第三方轉單 sandbox 管理員（task owner: Claude）                | sandbox 授權、雙向 signed receipts、取消與失去搶單對帳資料               | 以外部 order/receipt ID 讀回第三方 authoritative state；核對平台狀態與簽章。                                        |
| SR-LIVE-OPS-001     | SRE + DBA（task owner: Gemini）                                | 隔離 target 授權、backup/restore metadata、RPO/RTO 基準、排程重啟證據    | 唯讀查 project/target、backup ID/時間、restore run ID、row/checksum、job execution ID；實際還原另由 gate 授權執行。 |

以上 9 個 gate 與每個 required_acceptance key 都是 missing；未提供的資源 ID 使用 null，不能以設定存在或單元測試替代 provider receipt。銀行簽章/storage 在 DOC，bank/issuer sandbox 在 FINANCE，備份 metadata 在 OPS。

CTI/TWM/native voice 直接重用 [UV-EXEC-027](../unattended-voice-external-readiness.md)，merge `2093cf7e38526a7a7c027600be92004f7275efd3`。task 狀態讀回是 done，但合併報告仍列 7 項外部 missing；本次沒有供應商帳號、電話、商品/服務區、queue/SLA、data terms 或費率資源 ID，不解除 UV live gate。原報告已有技術/採購/營運/法務 owner 與讀回項目。

## 逐項當前證據

local = 有相關本機回歸，但完整 issue / live 仍 missing；indexed = 目前 SHA 已定位、實際重現仍 missing。每項完整 locator、歷史步驟及驗收要求在 readiness.json 的 issues。

| Issue | 當前結果 | 追溯任務                                                                          |
| ----- | -------- | --------------------------------------------------------------------------------- |
| R01   | indexed  | SR-PUBLIC-001, SR-READINESS-001                                                   |
| R02   | local    | SR-TENANT-LOGIN-001                                                               |
| R03   | local    | SR-ADMIN-VERIFY-001, SR-IAM-001                                                   |
| R04   | local    | SR-ADMIN-VERIFY-001                                                               |
| R05   | local    | SR-IAM-001                                                                        |
| R06   | local    | SR-BANK-001                                                                       |
| R07   | local    | SR-REFERRAL-001                                                                   |
| R08   | indexed  | SR-ENTERPRISE-DATA-001                                                            |
| R09   | indexed  | SR-ENTERPRISE-DATA-001                                                            |
| R10   | indexed  | SR-FLEET-DATA-001                                                                 |
| R11   | indexed  | SR-FLEET-DATA-001                                                                 |
| R12   | indexed  | SR-FLEET-CASE-001                                                                 |
| R13   | indexed  | SR-FLEET-SETTLE-001                                                               |
| R14   | local    | SR-BANK-003                                                                       |
| R15   | local    | SR-BANK-002, SR-IAM-001                                                           |
| R16   | local    | SR-BANK-001, SR-ENTERPRISE-DATA-001                                               |
| R17   | local    | SR-OPS-MAP-001                                                                    |
| R18   | indexed  | SR-OPS-SHELL-001                                                                  |
| R19   | indexed  | SR-OPS-SHELL-001                                                                  |
| R20   | indexed  | SR-ENTERPRISE-FORM-001                                                            |
| R21   | indexed  | SR-ENTERPRISE-FORM-001                                                            |
| R22   | indexed  | SR-ENTERPRISE-FORM-001                                                            |
| R23   | indexed  | SR-FLEET-FORM-001                                                                 |
| R24   | indexed  | SR-ENTERPRISE-SEARCH-001, SR-FLEET-DATA-001                                       |
| R25   | indexed  | SR-FLEET-FORM-001                                                                 |
| R26   | local    | SR-CHANNEL-001                                                                    |
| R27   | indexed  | SR-ENV-COPY-001                                                                   |
| R28   | local    | SR-BANK-001                                                                       |
| R29   | indexed  | SR-PUBLIC-001, SR-READINESS-001                                                   |
| R30   | indexed  | SR-DRIVER-WEB-001                                                                 |
| N01   | indexed  | SR-CONTRACT-001, SR-DESIGN-001, SR-LEAVE-BE-001, SR-LEAVE-FE-001, SR-WIRE-001     |
| N02   | indexed  | SR-ACADEMY-BE-001, SR-ACADEMY-FE-001, SR-CONTRACT-001, SR-DESIGN-001, SR-WIRE-001 |
| N03   | indexed  | SR-CONTRACT-001, SR-DESIGN-001, SR-HOST-BE-001, SR-HOST-FE-001, SR-WIRE-001       |
| N04   | local    | SR-ARTIFACT-001, SR-INVOICE-001                                                   |
| N05   | indexed  | SR-DEPS-001, SR-REPORT-001                                                        |
| N06   | local    | SR-MAIL-001, SR-NOTIFY-001                                                        |
| N07   | local    | SR-MAIL-002, SR-NOTIFY-001                                                        |
| N08   | local    | SR-ARTIFACT-001, SR-PLACARD-001                                                   |
| N09   | indexed  | SR-PROOF-001                                                                      |
| N10   | indexed  | SR-PUSH-001, SR-READINESS-001                                                     |
| N11   | indexed  | SR-ADMIN-ADAPTER-001                                                              |
| N12   | indexed  | SR-ADMIN-ADAPTER-001                                                              |
| N13   | indexed  | SR-OPS-CONTRACT-001                                                               |
| N14   | indexed  | SR-CONTRACT-001, SR-CONTRACT-READ-001, SR-OPS-CONTRACT-001                        |

## 已合併工作重用

| Task                | PR / merge SHA                                     |
| ------------------- | -------------------------------------------------- |
| SR-ADMIN-VERIFY-001 | #1638 / `feaf5c7f260970955a63389cb45f8f863577c214` |
| SR-ARTIFACT-001     | #1635 / `3e1904b1318a3252d3f7b5673173608fd6d12f71` |
| SR-BANK-001         | #1654 / `6d4c47feb1c68f8b53310597da7aeffb6940cc19` |
| SR-BANK-003         | #1688 / `b32ab8badb740b94cdf67212315ecfccf21f6d5d` |
| SR-CHANNEL-001      | #1730 / `9f5c81bd53b4930321f7c659a9b27b4bc2fe89c5` |
| SR-DEPS-001         | #1639 / `48b4bc4c5fe0f35a343f4b8c24ccb47f46a379c0` |
| SR-DESIGN-001       | #1645 / `f7595823014be07ad636651e9d5e966ed8aa4de6` |
| SR-IAM-001          | #1683 / `548608e45841ca9edcbf382399bbbfb74d164535` |
| SR-INVOICE-001      | #1664 / `a4876ac529abfb634c2b96f237116202abf3d87d` |
| SR-MAIL-001         | #1755 / `6f4ac8c74ae3618b6109efd010014365a85d36d8` |
| SR-MAIL-002         | #1646 / `564e27f63045789537b54f5c0b5909f6468032ca` |
| SR-NOTIFY-001       | #1633 / `3014f9a4942f73f89c0a6f8458dc8b042c1034d0` |
| SR-OPS-MAP-001      | #1647 / `bb265b286d718e61d2c50479deb0ddcd031a4597` |
| SR-PUBLIC-001       | #1759 / `610baa9820e627be013246afa042c81d8a42e771` |
| SR-REFERRAL-001     | #1665 / `503f36015adc084e75ee33e5a866525b5c7d72c6` |
| SR-TENANT-LOGIN-001 | #1674 / `3b60a3757238663572f16f010c94f446f2c71eaa` |
| SR-UAT-HARNESS-001  | #1651 / `1106728a6b5313a552757f745ec96c2be77a29e2` |

合併來源來自 base 的 git ancestry 與精確 task merge subject；不是 machine lifecycle done 推論。task_status_snapshots 是逐 task show 的時間快照，後續以 canonical show 為準。
