# PLATFORM-SESSION-ERROR-STATUS-DISPLAY-20261019

Owner: Codex2. Independent reviewer: Codex. Accepted base: `a7ec8281ff35399eb35728facca75c54af0d5cf1`, verified against the live dev reference before work. Full specification SHA256: `f09d31d346cbbf06dd8578abfb34cec1e584fb6f78016cd86ec871913ba093eb`. The installed CLI started this distinct three-scope task before edits. Its original session parent remains DONE; the frozen ENTRY-TENANT acceptance holder retains its existing candidate, generation, roles, status and HOLD, with only Root's normal read-dependency coordination.

## Defect and correction

The actual `UserDetailDrawer` inventory/revoke catches combined authoritative status checks with a broad `message.includes("403")`. The real SDK includes the full response body in `ApiClientError.message`; an unrelated error trace UUID containing 403 could therefore make an actual storage 503 appear to be an authorization denial.

Both catches now use the same local presentation function. A numeric `statusCode` takes precedence, including errors from another loaded SDK constructor. Without that status, exact structured denial codes are recognized. Only errors lacking structured signals use a legacy message fallback, restricted to explicit HTTP/API 403 or denial-code prefixes. Other errors retain their original message/default failure display. True 403 inventory/write failures retain the existing denial copy.

This changes error presentation only. The original explicit Refresh, no automatic retries, selected-session ownership, success/readback, proof acquisition, original request contents, IAP/CSRF/MFA/role/SDK/API/database policies remain. Normal formatting wrapped three existing BreakGlass disabled expressions without changing them; structural TypeScript AST comparison confirms all 23 non-session top-level declarations are unchanged.

## Meaningful before and fixed checks

The existing mounted flow runs the production drawer, client wrapper, SDK/error class, proof producer, BFF, auth guard, controller and IdentityRepository using the existing controlled socket/browser transport. The real `ApiRequestError` producer creates the 503 envelope. Tests control only its normally random trace fixture to `11111403-1111-1111-1111-111111111111` or the no-403 counterpart. Both read/list-repository and revoke-repository paths use those envelopes through the real SDK. A distinct UI-side SDK constructor verifies that structural status is preserved across module identity boundaries.

The original five mounted cases and every original assertion remain. The original repository failure trace is now a deterministic external fixture, preserving its real storage-failure assertion instead of relying on random UUID contents. Additional compatibility-only cases control the SDK method's rejected value for plain legacy/structured errors; those cases establish the actual presentation behavior, not live backend transport.

- The same **25 mounted tests** on literal accepted-base production Source: **10 failed / 15 passed**, direct exit **1**. Failures reproduce the 503 trace collision on read and revoke, typed status versus misleading message/code, code-only refusal and unrelated legacy trace text.
- Fixed actual mounted flow: **25 passed**, direct exit **0**.
- Complete original session task directory plus existing identity-session/context regressions: **82 passed in 6 files**, direct exit **0**. The 25 mounted tests are included; do not add the separate before/fixed runs to this total.
- Scoped ESLint: exit **0**, zero warnings.
- Platform Admin TypeScript: exit **0**.
- Normal pre-commit formatting/lint/generated-file checks and commit trailer checks pass. No hooks were bypassed and no package installation occurred.

The tests retain true 403 read/write controls, proof/repository failure controls, no automatic retry after rerender, explicit Refresh without repeated mutation, successful selected-session revoke and same-session repository readback, refresh-family revocation and the untouched unselected session. Repository tests here use the existing no-DB repository mode; they do not establish formal PostgreSQL or live provider behavior.

## Evidence, review and limits

Evidence is under `.local/platform-session-error-status-display-20261019-evidence/`: normal before/start snapshots, `before-source-identity.json` (literal base blob/hash plus unchanged final test hash), actual command/exit/log files, `non-session-declarations-unchanged.json`, final candidate Source/blob hashes, PR and canonical handoff generation. Root's prior GPS2212 raw/probe evidence is read-only and retained separately.

The earlier GPS2212 hosted failure showed the storage-failure assertion receiving denial output. Its raw log did not capture the actual trace UUID. This candidate's deterministic mounted tests prove the source mechanism; they do not identify that earlier execution's exact UUID or claim a real authorization rejection.

1. `platform-session_error-display_typed-status-and-trace-collision`: Source implemented and actual mounted before/fixed evidence recorded for read/revoke and module boundaries.
2. `platform-session_error-display_original-mounted-flow-regressions`: all original five mounted cases/assertions and complete selected original session regressions pass, with finite controlled-transport limits above.
3. `platform-session_error-display_exact-candidate-review-CI-merge`: pending normal independent exact-candidate Codex review, mandatory own hosted CI, protected merge and authorized acceptance recording. The owner does not approve or record keys.

Normal anchor/plain push precedes this closeout; the final immutable full branch head and generation are recorded by installed CLI handoff. No product/dev/preview/browser/E2E/HTTP/PG/Compose service was started on the VM. No security policy/mechanism, full16, production deployment or whole-goal completion is claimed.
