# SR-PUBLIC-001 候選證據

- Owner: `Codex`
- Reviewer: `Claude`
- Base SHA: `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` (`origin/dev` read at 2026-09-08)
- Candidate SHA: recorded only after final commit and push
- Resource IDs: nine Cloud Run services listed in `public-entry-repair.md`

## 可重現的目前觀察

在 base SHA 上以唯讀方式執行：

```text
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --mode json
exit=0
```

2026-09-08 的結果為：9 個 active custom domains 都解析到 `8.233.119.14`、direct TLS／HTTP 都是 curl exit 35、以 GFE IP 強制 SNI 的 TLS 成功但 HTTP 為 404；兩個探測 suffix（current repo inventory `4t7rg6fmeq-uc.a.run.app`、historical audit `lyo6ra57fq-uc.a.run.app`）在本次 probe 均為 404。這是此 runner／網路位置的觀察，**不是** authoritative DNS、Cloud Run domain mapping 或部署狀態的根因判定。

本次未使用 gcloud credentials、沒有變更 DNS／Cloud Run／OIDC，也沒有真機或真實角色登入。這些項目仍交給 `SR-LIVE-ENTRY-001`，必須帶 authorized readback 與 candidate SHA 完成。

## 回歸驗證

```text
python3 ... --offline --mode verify --target diagnosis                         exit=0
python3 ... --offline --mock-state repaired --mode verify --target recovery   exit=0
pnpm exec vitest run tests/unit/system-remediation/sr-public-001/              exit=0 (22 tests)
git diff --check                                                               exit=0
```

offline 是隔離的程式契約測試，並非公網成功證據。它覆蓋：9-entry registry、bounded redirect／final URL、diagnosis/recovery 判定分離，以及 `EAI_AGAIN` fail-closed。
