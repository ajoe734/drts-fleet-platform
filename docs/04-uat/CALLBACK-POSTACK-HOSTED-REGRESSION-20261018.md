# CALLBACK-POSTACK-HOSTED-REGRESSION-20261018

Owner Claude2; reviewer Codex. Status: source fix applied; hosted GitHub Actions
re-run of the real OpsShell/API/PostgreSQL browser case is the acceptance
evidence and is pending the normal candidate CI cycle (this VM cannot start
Playwright, the Next.js app, or Postgres). Scope is limited to the single
synchronization gap at the "記錄聯繫結果" (record contact result) step of
`tests/e2e/system-remediation/sr-ops-shell-001/voice-callback-workbench.spec.ts`;
no other case, assertion, or production source changed.

## Root cause

Historical parent task `NOTICE-FLAGS-CANONICAL-DELIVERY-FLOW-20261015` merged
this case at `8daa6668b` (`source_regression_sha`). The hosted run recorded in
`.local/goal-continuation-20261018T211300Z-original-Voice-scope-and-dot7-live-root/independent-own-accepted8daa-callback-GET-before-real-POST-ACK-race.json`
shows the case intermittently failing at the first contact-result assertion:

- `attempt_POST_start` 3211.7ms, `attempt_POST_response_completed` 3359.5ms.
- `read_GET_start` 3241.1ms, `read_GET_response_complete` 3249.1ms,
  `assertion_failed` 3252.7ms — the readback GET started and finished while the
  real `POST /voice/callbacks/{taskId}/attempts` was still in flight.
- The text assertion on `"SIM operator observed answered call"` (the previous
  `.first()` check) matches the already-filled form field even before the
  server ACK, so it does not prove the attempt row committed. The immediately
  following `GET /voice/callbacks/{taskId}` can therefore observe the
  pre-attempt state (`status: claimed`, `version: 2`, `attempts: []`) instead of
  the committed state (`version: 3`, one `answered` attempt) that the real
  `POST` returns moments later with `201`.
- This is a test synchronization gap, not a missing commit, a lost receipt, or
  a BFF/API defect: the trace confirms the same data is present once the POST
  actually finishes.

## Fix

`tests/e2e/system-remediation/sr-ops-shell-001/voice-callback-workbench.spec.ts`,
the "Explicit SIM contact observation" step (previously lines 121–132): arm a
`page.waitForResponse` matcher for the exact same-task
`POST /voice/callbacks/{taskId}/attempts` request before the button click,
keep the existing optimistic-text assertion, then `await` that real response,
assert `response.ok()`, and read its body (`response.json()`) before issuing
the canonical-history `GET`. This guarantees the GET only runs after the real
POST has fully committed and returned, closing the race without adding any
sleep, retry, timeout, mock, or weakened assertion. All downstream assertions
(SQL attempt shape, transfer, completion, lost-response recovery, cancellation,
dial-reconcile, and the independent 3-task/8-receipt SQL readback) are
unchanged.

## Verification

This VM may not start product dev servers, Playwright, or Docker Compose; the
case itself also hard-fails unless `GITHUB_ACTIONS === "true"`. Verification
here is limited to static checks on the changed file plus confirmation that no
other assertion moved:

| Check      | Command                                                                                                      | Result                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint       | `npx eslint tests/e2e/system-remediation/sr-ops-shell-001/voice-callback-workbench.spec.ts --max-warnings=0` | pass, no output                                                                                                                               |
| Format     | `npx prettier --check tests/e2e/system-remediation/sr-ops-shell-001/voice-callback-workbench.spec.ts`        | pass                                                                                                                                          |
| Typecheck  | `npx tsc -p tsconfig.json --noEmit`                                                                          | no new errors attributable to this file; remaining root errors are pre-existing stale `@drts/*` package build output unrelated to this change |
| Diff scope | `git diff --stat`                                                                                            | one file, 9 insertions, 0 deletions, no assertion removed or weakened                                                                         |

Hosted re-run of the real OpsShell/API/PostgreSQL browser case (6-stage,
14-stage, 3-task, 8-receipt flow) on the pushed candidate SHA is the required
acceptance evidence for `callback_POST_ACK_before_canonical_history_read` and
`callback_original_full14_SQL_receipts_and_candidate_validation`, and is
expected to run through the normal candidate CI cycle once this change is
pushed and a PR/handoff is opened to Codex.
