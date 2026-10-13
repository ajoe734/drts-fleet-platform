# DRIVER-STATEMENT-ACTIONS-20261013

Owner: Codex · independent reviewer: Codex2.

Base: `3849e6f301cdcd1a71466eb1667c41bfc885c26b`. Implementation is in the isolated locked `driver-statement-actions-20261013` worktree. Root records the final candidate SHA, PR and formal lifecycle after the source freeze.

## Requirement and original failure

Driver Phase 1 [handoff §5.5](../05-ui/driver-app-design-handoff-packet-20260525.md) requires monthly receipt number, period, trip count, fee-plan version, payout and statement detail. The approved [earnings Canvas](../05-ui/drts-design-canvas/driver-screens-3.jsx) supplies the existing monthly rows and detail affordance. C058 requires the driver's statement/receipt download.

The original Earnings screen displayed a populated monthly row with an available artifact but had no detail or download action. The immutable current-dev audit at the base above retained one populated-render control pass and two positive action failures. Its evidence is under `.local/full-completion-audit-20261013T0505-root/final-unblocked-scan/driver-earnings.latest-dev-result.json`, with qualification in that directory's `classification.json`. The deliberately invalid fixture URL was never downloaded; this baseline proves missing UI consumers, not delivery of document bytes.

The initial implementation reused the existing SDK `getDriverStatement(statementId)` and backend artifact/renewal behavior. A subsequent actual-guard review found that the legacy `/api/driver-statements` routes require `billing:read`, while a normal Driver device session carries `driver:read`, `driver:write` and `dispatch:read`. Both legacy reads returned `AUTH_SCOPE_DENIED`; allowing the Driver realm on the controller did not grant the missing scope. The earlier component and SDK transport tests did not establish this authenticated route compatibility.

F1 therefore adds the narrow read aliases `/api/driver/profile/statements` and `/api/driver/profile/statements/:statementId`. Separate Driver-only controller wrappers forward the original identity to the existing list/detail handlers under the existing `driver/profile/*` policy. The list accepts the existing period filters and selects the current driver's records. The UI uses the real SDK's generic `getList`/`get` methods through the Driver statement helper. Existing operational SDK methods, legacy route metadata, auth policy, session scopes, contracts, monetary calculations and artifact renewal remain unchanged. No database, native hosting or provider setup is added.

## Resulting behavior

- Monthly rows now open inline statement detail inside the existing Earnings card. The current receipt, fee-plan version, payout and net amount remain visible; expanded detail shows gross, fee, subsidy and actual per-trip lines, including required reimbursement.
- Opening detail reads the Driver profile statement alias through the generic SDK. The returned current record updates the same row and Earnings' statement totals. Loading disables duplicate actions; errors retain an explicit same-statement retry.
- Download reads the same statement again before calling the existing `Linking.openURL` pattern. This gives the backend a chance to renew an expired signed link. Current `artifactDownloadMetadata.downloadUrl` takes precedence over a cached artifact URL; legacy artifact URLs remain supported.
- Missing, still-expired or unreadable artifact metadata is displayed as unavailable. A failed detail request never opens the cached URL. An opener failure remains visible and can retry through another fresh read. Opening a URL does not display a fabricated download-success receipt.
- Removing the row during a pending request prevents the stale response from updating the Earnings state or opening a download.
- A failed monthly-list request has its own notice and real refresh action, while independent platform earnings remain available. A successful empty response retains the existing no-statements state.

All new copy is in `driverStrings.earnings.statement`; the existing Driver theme and money/payout formatters are reused. There is no standalone artboard or change to the today/week/month switcher.

## Verification

Initial scoped implementation verification: ten production React component/screen tests and six pure resolver/real SDK-route tests passed. Driver TypeScript passed. The initial component run retained the existing renderer deprecation notice and an act-environment warning; the test harness now sets the standard React act environment flag before the final regression run. No product runtime was started.

The initial UI-only verification passed **343/343** affected Driver tests, including the **11** new component/screen cases, plus **6/6** download/SDK cases: **349 distinct scoped passes**, with zero skipped tests. Its reports and `.local/driver-statement-actions-20261013/verification.before-driver-alias.json` are retained. Initial lint identified two unused imports after moving the row, and root typecheck identified a test-only SDK alias resolution issue; both were corrected within the task scope and the successful follow-ups are retained.

The F1 consumer rerun uses the final Driver profile paths and passed **343/343** affected Driver tests plus **10/10** download/real generic SDK cases: **353 distinct consumer passes**, with zero skipped tests. Reports are `driver-regressions.f1.json` and `download-tests.f1.json` under `.local/driver-statement-actions-20261013/`. The added cases execute the production helper and real SDK, verifying encoded alias paths, optional month query, bearer preservation, existing Driver read policy, snake-case/list-envelope decoding, current artifact metadata and error propagation. They preserve the legacy operational SDK route control and explicitly demonstrate its scope mismatch with a mocked denied transport.

The backend's actual bearer/guard/Nest handler tests are separate evidence under `.local/driver-statement-actions-20261013/api-reader/`: `baseline.json` retains both real legacy scope-denied controls, the operational compatibility control and three missing-alias failures. Those original positive probes targeted the then-proposed platform-earnings aliases; the final paths were corrected to Driver profile aliases before publication. `final.json` passes **7/7** using the real existing guard, signed Driver/operational sessions, route metadata and statement service without a product server. It covers Driver list/detail, existing ownership behavior, the unchanged operational route and Driver-only alias metadata.

The new component suite exercises real Earnings/statement-row/helper logic and real Canvas primitives, mocking native render/OS opener, generic API responses and identity boundary only. The SDK tests execute the actual generic transport and unchanged operational method against mocked fetch. The standard renderer deprecation notice remains a library warning, not a failed check or a native-device acceptance result. Final source hashes and repository checks are recorded in `verification.json` after the F1 source freeze.

Required behavior checks cover current detail fields, duplicate-click pending state, same-statement error retry, expired-list link renewal, denied current download read, missing artifact retry, still-expired fresh metadata, opener failure retry, removed-row response, monthly-list failure/refresh and genuine empty data. Existing route guards, operational labels, no-internal-vocabulary and responsive-layout checks are included in the affected regression command.

## Acceptance boundary

Only repository unit/component/types/lint checks run on this VM. No Metro, product server, browser/E2E server, database or Docker infrastructure is started. The native opener is a test boundary, and `example.invalid` fixtures are never fetched as real files. Existing `SR-LIVE-DRIVER-001` device/file-delivery acceptance remains separate, and native Phase B remains deferred. This change does not claim full-system, provider, native-device or production acceptance.
