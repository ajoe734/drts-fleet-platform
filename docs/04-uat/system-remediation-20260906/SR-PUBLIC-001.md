# SR-PUBLIC-001 — 實作與診斷證據

Owner Codex2 / Reviewer Codex。交付為修復準備，公開入口尚未恢復。

- 初始 `git fetch origin && git rebase origin/dev` exit 0；base `6f4ac8c74ae3618b6109efd010014365a85d36d8`。
- 分支 `codex2/sr-public-001`；歷史 audit `08b7a32…` 僅供追溯。
- 本文 raw snapshot 的執行 HEAD 是 `3cc32ef467de04c8546d7fa349fe181ce730f4e8`（anchor），工具 hash 見 JSON。
- 最終 candidate 為包含本文的提交，由 machine-truth handoff 鎖定。為避免 SHA 自我引用，最終 SHA 的重跑 raw JSON 及測試结果附在同一 PR description，核對其 candidate_sha 與 PR head。
- write scopes 僅限工具、專屬測試、本文與 public-entry-repair.md。未改 auth／workflow／共用配置。

## 實際結果

本機 resolver `127.0.0.53` 的結果不等於 authoritative DNS 真值。
九入口均有 A 記錄、DNS query exit 0；TLS EOF（exit 1），curl exit 35／HTTP 000。
未發生 HTTP redirect；final_url 只是 curl 最後嘗試 URL，並非成功登入落點。
環境 proxy 變數為空；明確 `--noproxy '*'` 亦同樣失敗。
不能由這些結果推論憑證到期或 DNS provider 根因。

| 入口     | A            | TLS exit | curl 環境／直連 exit | HTTP | 最後嘗試 URL                        |
| -------- | ------------ | -------- | -------------------- | ---- | ----------------------------------- |
| fleets   | 8.233.119.14 | 1        | 35 / 35              | 000  | https://fleets.smarttransport.tw/   |
| ops      | 8.233.119.14 | 1        | 35 / 35              | 000  | https://ops.smarttransport.tw/      |
| partners | 8.233.119.14 | 1        | 35 / 35              | 000  | https://partners.smarttransport.tw/ |
| dispatch | 8.233.119.14 | 1        | 35 / 35              | 000  | https://dispatch.smarttransport.tw/ |
| bank     | 8.233.119.14 | 1        | 35 / 35              | 000  | https://bank.smarttransport.tw/     |
| channel  | 8.233.119.14 | 1        | 35 / 35              | 000  | https://channel.smarttransport.tw/  |
| tenant   | 8.233.119.14 | 1        | 35 / 35              | 000  | https://tenant.smarttransport.tw/   |
| refer    | 8.233.119.14 | 1        | 35 / 35              | 000  | https://refer.smarttransport.tw/    |
| api      | 8.233.119.14 | 1        | 35 / 35              | 000  | https://api.smarttransport.tw/      |

`gh variable list --json name,value` exit 0（僅保存 project/region 非敏感欄位）：
`DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、`DEV_GCP_REGION=us-central1`。
最初嘗試 asia-east1 未取到資料，後以 repository variable 確認 us-central1；正式報告使用後者。
`gcloud config list --format=json` exit 0，但有本機設定不等於 token 有效。
正式 services list 與 domain-mappings list 均 exit 1：
`Reauthentication failed. cannot prompt during non-interactive execution.`
九個 resource_id 是查詢目標，不代表已證實資源存在；service、cloud_run、serving revision 均 unknown。
沒有使用舊 suffix 替代 discovery。

`gh run list --workflow deploy-dev.yml --limit 3 --json databaseId,headSha,status,conclusion,url` exit 0：
最新列出的成功 run [34177265018](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34177265018)
head `650e233bb1c35269852c291ef892d25967380c12`。
它是 workflow 歷史結果，不證明目前流量 revision，也不是本 task candidate CI。

## 驗證與剩餘 gate

- `pnpm exec vitest run tests/unit/system-remediation/sr-public-001/`：exit 0，1 個 Vitest bridge 執行 7 個 Python regression cases（最後 candidate 重跑見 PR）。
- `pnpm exec eslint tests/unit/system-remediation/sr-public-001/endpoints.test.ts --max-warnings=0`：exit 0。
- `pnpm exec prettier --check tests/unit/system-remediation/sr-public-001/endpoints.test.ts docs/04-uat/system-remediation-20260906/public-entry-repair.md docs/04-uat/system-remediation-20260906/SR-PUBLIC-001.md`：最後檢查見 PR；初次 TS formatting exit 1 已修正。
- `git diff --check`：exit 0。
- 下列診斷命令：exit 1，這是如實記錄網路與 discovery 失敗，不能當作通過。

```bash
python3 tools/system-remediation/public-entry/system-remediation-endpoints.py --project drts-dev-devcc-20260825 --region us-central1 --base-sha 6f4ac8c74ae3618b6109efd010014365a85d36d8
```

根 package 既有 test runner 為 Vitest，Python 無額外依賴；未改 app TS，故不跑無關全庫 typecheck。
測試只驗證診斷失敗語義與清單／revision 採集，offline mocks 並非 live 成功證據。
未做：雲端修改、DNS／憑證修正、真角色／真機／IdP callback、同 SHA 部署、rollback 演練。
可 review 的條件式修復及 rollback 參見 [public-entry-repair.md](public-entry-repair.md)。
需 SR-LIVE-ENTRY-001 取得授權工作階段、DNS provider 狀態及真實測試身份後續跑；
SR-TENANT-LOGIN-001 負責 callback 程式修復。本 owner 不直接 done。

## 原始命令、exit code 與輸出（anchor snapshot）

```json
{
  "started_at": "2026-09-08T13:52:35.669042+00:00",
  "observed_at": "2026-09-08T13:52:38.975454+00:00",
  "base_sha": "6f4ac8c74ae3618b6109efd010014365a85d36d8",
  "candidate_sha": "3cc32ef467de04c8546d7fa349fe181ce730f4e8",
  "git_status": {
    "command": ["git", "status", "--porcelain"],
    "exit_code": 0,
    "stdout": "",
    "stderr": ""
  },
  "tool_sha256": "3e22e22b3b4fbf0560430c32fa68ab4be46bd7a59dc7bfc24300245f18f269d8",
  "project": "drts-dev-devcc-20260825",
  "region": "us-central1",
  "proxy_variables_present": [],
  "cloud_discovery": {
    "command": [
      "gcloud",
      "run",
      "services",
      "list",
      "--project=drts-dev-devcc-20260825",
      "--region=us-central1",
      "--quiet",
      "--format=json(metadata.name,metadata.labels,status.url,status.latestReadyRevisionName,status.traffic)"
    ],
    "exit_code": 1,
    "stdout": "",
    "stderr": "ERROR: (gcloud.run.services.list) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.\nPlease run:\n\n  $ gcloud auth login\n\nto obtain new credentials.\n\nIf you have already logged in with a different account, run:\n\n  $ gcloud config set account ACCOUNT\n\nto select an already authenticated account to use."
  },
  "domain_mappings": {
    "command": [
      "gcloud",
      "beta",
      "run",
      "domain-mappings",
      "list",
      "--project=drts-dev-devcc-20260825",
      "--region=us-central1",
      "--quiet",
      "--format=json(metadata.name,spec.routeName,status.conditions,status.resourceRecords)"
    ],
    "exit_code": 1,
    "stdout": "",
    "stderr": "ERROR: (gcloud.beta.run.domain-mappings.list) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.\nPlease run:\n\n  $ gcloud auth login\n\nto obtain new credentials.\n\nIf you have already logged in with a different account, run:\n\n  $ gcloud config set account ACCOUNT\n\nto select an already authenticated account to use."
  },
  "entries": {
    "fleets": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-platform-admin-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://fleets.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "fleets.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41590\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 15 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 124",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "fleets.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 32702\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\nfleets.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 69",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "fleets.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 53662\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 16 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 124",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "fleets.smarttransport.tw:443",
            "-servername",
            "fleets.smarttransport.tw",
            "-verify_hostname",
            "fleets.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "409764629C730000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://fleets.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://fleets.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to fleets.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://fleets.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://fleets.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://fleets.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to fleets.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://fleets.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "ops": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-ops-console-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://ops.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "ops.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 3548\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 1 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 121",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "ops.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 10027\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\nops.smarttransport.tw.\t499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 66",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "ops.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 25517\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 14 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 121",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "ops.smarttransport.tw:443",
            "-servername",
            "ops.smarttransport.tw",
            "-verify_hostname",
            "ops.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "40275C525E770000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://ops.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://ops.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to ops.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://ops.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://ops.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://ops.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to ops.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://ops.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "partners": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-fleet-partner-portal-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://partners.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "partners.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 64767\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 16 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 126",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "partners.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 28352\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\npartners.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 71",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "partners.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 51853\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 15 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 126",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "partners.smarttransport.tw:443",
            "-servername",
            "partners.smarttransport.tw",
            "-verify_hostname",
            "partners.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "40875BAC4C710000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://partners.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://partners.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to partners.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://partners.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://partners.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://partners.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to partners.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://partners.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "dispatch": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-enterprise-dispatch-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://dispatch.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "dispatch.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 53016\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 2 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 126",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "dispatch.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 8261\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\ndispatch.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 71",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "dispatch.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 32778\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 6 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 126",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "dispatch.smarttransport.tw:443",
            "-servername",
            "dispatch.smarttransport.tw",
            "-verify_hostname",
            "dispatch.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "write:errno=104"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://dispatch.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://dispatch.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to dispatch.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://dispatch.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://dispatch.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://dispatch.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to dispatch.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://dispatch.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "bank": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-bank-console-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://bank.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "bank.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 29954\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 16 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 122",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "bank.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 65165\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\nbank.smarttransport.tw.\t499\tIN\tA\t8.233.119.14\n\n;; Query time: 1 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 67",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "bank.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 34208\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 14 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 122",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "bank.smarttransport.tw:443",
            "-servername",
            "bank.smarttransport.tw",
            "-verify_hostname",
            "bank.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "40E72DF9C7700000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://bank.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://bank.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to bank.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://bank.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://bank.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://bank.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to bank.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://bank.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "channel": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-channel-partner-portal-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://channel.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "channel.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 15112\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 14 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 125",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "channel.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 49779\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\nchannel.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 70",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "channel.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 42440\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 16 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 125",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "channel.smarttransport.tw:443",
            "-servername",
            "channel.smarttransport.tw",
            "-verify_hostname",
            "channel.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "4037AD04D07D0000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://channel.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://channel.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to channel.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://channel.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://channel.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://channel.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to channel.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://channel.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "tenant": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-tenant-console-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://tenant.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "tenant.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 28877\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 1 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 124",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "tenant.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 34237\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\ntenant.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 69",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "tenant.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 54346\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 2 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 124",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "tenant.smarttransport.tw:443",
            "-servername",
            "tenant.smarttransport.tw",
            "-verify_hostname",
            "tenant.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "40A738DC207A0000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://tenant.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://tenant.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to tenant.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://tenant.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://tenant.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://tenant.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to tenant.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://tenant.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "refer": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-referral-embed-web",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://refer.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "refer.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 33091\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 1 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 123",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "refer.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 51161\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\nrefer.smarttransport.tw. 499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 68",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "refer.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 36379\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 3 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 123",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "refer.smarttransport.tw:443",
            "-servername",
            "refer.smarttransport.tw",
            "-verify_hostname",
            "refer.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "400762EDB3740000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://refer.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://refer.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to refer.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://refer.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://refer.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://refer.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to refer.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://refer.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    },
    "api": {
      "resource_id": "projects/drts-dev-devcc-20260825/locations/us-central1/services/drts-dev-api",
      "service": null,
      "serving_revisions": {},
      "public": {
        "url": "https://api.smarttransport.tw/",
        "dns": {
          "CNAME": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "api.smarttransport.tw",
              "CNAME"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 53744\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 14 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 121",
            "stderr": ""
          },
          "A": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "api.smarttransport.tw",
              "A"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41244\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; ANSWER SECTION:\napi.smarttransport.tw.\t499\tIN\tA\t8.233.119.14\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 66",
            "stderr": ""
          },
          "AAAA": {
            "command": [
              "dig",
              "+time=3",
              "+tries=1",
              "+noall",
              "+comments",
              "+answer",
              "+stats",
              "api.smarttransport.tw",
              "AAAA"
            ],
            "exit_code": 0,
            "stdout": ";; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 48929\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; Query time: 14 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Tue Sep 08 13:52:38 UTC 2026\n;; MSG SIZE  rcvd: 121",
            "stderr": ""
          }
        },
        "tls_direct": {
          "command": [
            "openssl",
            "s_client",
            "-connect",
            "api.smarttransport.tw:443",
            "-servername",
            "api.smarttransport.tw",
            "-verify_hostname",
            "api.smarttransport.tw",
            "-verify_return_error",
            "-brief"
          ],
          "exit_code": 1,
          "stdout": "",
          "stderr": "40071970BC7C0000:error:0A000126:SSL routines:ssl3_read_n:unexpected eof while reading:../ssl/record/rec_layer_s3.c:316:"
        },
        "http_environment": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "https://api.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://api.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to api.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://api.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        },
        "http_direct": {
          "command": [
            "curl",
            "--disable",
            "--silent",
            "--show-error",
            "--location",
            "--max-redirs",
            "5",
            "--connect-timeout",
            "5",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--output",
            "/dev/null",
            "--write-out",
            "{\"status\":\"%{http_code}\",\"final_url\":\"%{url_effective}\",\"remote_ip\":\"%{remote_ip}\",\"redirects\":%{num_redirects},\"ssl_verify_result\":%{ssl_verify_result}}",
            "--noproxy",
            "*",
            "https://api.smarttransport.tw/"
          ],
          "exit_code": 35,
          "stdout": "{\"status\":\"000\",\"final_url\":\"https://api.smarttransport.tw/\",\"remote_ip\":\"8.233.119.14\",\"redirects\":0,\"ssl_verify_result\":1}",
          "stderr": "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to api.smarttransport.tw:443",
          "response": {
            "status": 0,
            "final_url": "https://api.smarttransport.tw/",
            "remote_ip": "8.233.119.14",
            "redirects": 0,
            "ssl_verify_result": 1
          },
          "reachable": false
        }
      },
      "cloud_run": null,
      "cloud_run_status": "unknown: discovery unavailable or URL missing"
    }
  },
  "acceptance": "diagnostic only; no authenticated journey, deployment or rollback performed"
}
```
