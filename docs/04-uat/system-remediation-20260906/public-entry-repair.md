# SR-PUBLIC-001 公開入口診斷與修復準備

本工具只讀；live 變更及真實登入驗收由 SR-LIVE-ENTRY-001 執行。
來源：R01/R29、C001/C124、task execution spec；歷史 audit `08b7a32…` 不代表目前程式。

目前 GitHub repository variables（2026-09-08 `gh variable list --json name,value`）:
`DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、`DEV_GCP_REGION=us-central1`。
每次執行仍須讀回當下變數，不使用舊 runbook 的 `nodal-alloy-503700-s3`，
也不拼接歷史 `4t7rg6fmeq` 或 `lyo6ra57fq` URL suffix。
現有 deploy-dev.yml 已寫入 DRTS_CANDIDATE_SHA 並查詢 status.url；沿用它，不新增替代部署真值。

```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py \
  --project drts-dev-devcc-20260825 --region us-central1 \
  --base-sha 6f4ac8c74ae3618b6109efd010014365a85d36d8 > /tmp/sr-public-001.json
```

JSON 記錄執行 HEAD、工具 hash、dirty status、UTC、九個 resource ID、DNS 回覆、
SNI/hostname 驗證、環境 proxy 和直連 HTTP 結果及最終 URL。
不輸出 proxy URL／認證值、cookie、頁面內容或完整服務環境變數。
exit 1 代表至少有未通過／未取得的觀察，不能把取得報告當成功。
HTTP 200 也不是登入／業務驗收。直接 TLS 不經 HTTP proxy；兩者差異不能直接歸因憑證。
Cloud Run URL 僅從成功的 services list 取得；失敗填 unknown，不回退到歷史網址。
版本清單保存服務流量、實際承接流量的 revisions、image digest 和 labels；
部署 SHA 必須再與同次 Deploy - Dev 的 build candidate、image digest 核對，不能把工具 HEAD 當部署 SHA。
