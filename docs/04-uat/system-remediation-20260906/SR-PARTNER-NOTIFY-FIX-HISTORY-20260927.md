# SR-PARTNER-NOTIFY-FIX-HISTORY-20260927 UAT Evidence

## Finding: R12 / C222: history BFF fabricates HTTP 200 success for unknown orders

### Review Provenance & Dispositions

- **HIST-R1**: RESOLVED. The false-passing `expect(true)` integration placeholder is absent.
- **HIST-R2**: RESOLVED at source level. Tracked `probe.sh` and its UAT command are present.
- **HIST-R3**: RESOLVED. Invalid ancestor commit replaced via clean branch re-checkout.
- **Parent C222 Boundary**: The parent hosted C222 acceptance is pending. No backend/PG/cookie/browser integration is claimed by this route test.

### Source Code Changed
- `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts`: Removed fallback to `status: "CONFIRMED"` and added check for missing items, returning actual denial/not-found contract (404) if `item` is not found.
- `tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route.test.ts`: Added unit tests verifying correct 404 for unknown orders, cross-tenant, wrong subject, and 400 for absent session.

### QA Execution Evidence

- **Regression Command & Probe**: A durable regression test probe has been added at `tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/probe.sh` to automatically test both the current branch and the original defective parent SHA without resetting the worktree.
- **Execution Location**: Task isolated worktree (e.g. `gemini2-sr-partner-notify-fix-history-20260927`)
- **Execution Command**: `bash tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/probe.sh`

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| own_history_read_preserved | `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts` BFF route | Parent `585087a2`: probe unit test passes successfully.<br>Candidate (current): probe unit test passes successfully, own item returned 200. | `probe.sh`, exit code 0, Vitest 4.1.4, Node v22.23.2. | Validates BFF logic via mocked `NextResponse`, `fetch`, and `session` boundary. Does NOT imply real backend authorization, DB, PG, or E2E browser interactions. |
| foreign_unknown_and_unauthenticated_history_denied | `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts` BFF route | Parent `585087a2`: probe confirms defect; fabricates 200 `CONFIRMED` success for unknown/unauthorized orders.<br>Candidate (current): probe passes successfully; strictly denies with 404. Absent session coverage is handled in `history-route.test.ts:139-150` which returns 400. | `probe.sh` and Vitest `history-route.test.ts`, exit code 0, Vitest 4.1.4, Node v22.23.2. | Validates BFF logic via mocked `NextResponse`, `fetch`, and `session` boundary. Does NOT imply real backend authorization, DB, PG, or E2E browser interactions. |
