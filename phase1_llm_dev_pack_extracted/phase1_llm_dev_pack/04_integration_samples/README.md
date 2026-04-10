# 04. Integration Sample Pack

本資料夾提供 **外部整合真實樣本格式**，用途如下：

- 給 LLM 實作 adapter / webhook handler / CSV parser
- 給 QA 直接做 mock server / fixture
- 給前端做 payload 假資料與 contract 驗證
- 給 DevOps / SRE 建立 replay / retry 測試

## 檔案清單

- `cti_incoming_call.json`
- `cti_recording_ready.json`
- `forwarder_inbound_order.json`
- `forwarder_accept_confirmed.json`
- `forwarder_lost_race.json`
- `forwarder_cancelled.json`
- `tenant_webhook_order_assigned.json`
- `map_geocode_response.json`
- `map_eta_response.json`
- `invoice_metadata.json`
- `reconciliation_sample.csv`
- `regulatory_filing_manifest.json`

## 規則

- 所有 sample 僅為 canonical example，不代表第三方唯一格式。
- 若實際第三方格式不同，必須新增 adapter mapping，不可直接改核心 API。
