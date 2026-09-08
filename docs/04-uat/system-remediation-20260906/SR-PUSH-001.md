# SR-PUSH-001 — current-dev reproduction and scope blocker

## Baseline and traceability

- Owner: Codex2; reviewer: Codex. Task branch: `codex2/sr-push-001`.
- Fetched/rebased base: `e97653b7ffb962a6c4d688e8706711d860fa3604` (2026-09-08).
- `UV-EXEC-006` is canonical `done`; its merge is this base (PR #1822), candidate `79affb5411be10976aa3f7eab2435457418ded7e`.
- Sources: execution task specification, main execution rules, source `new-gaps.json` N10 and `capabilities.json` C023. The historical audit is not treated as current code truth.
- `readiness.json`, `SR-LIVE-PUSH-001` entry: provider account, authorized device, device delivery evidence and live candidate SHA are missing. This is the recorded readiness snapshot, not a live provider-console query.
- This is a reproduction anchor, **not an implementation candidate**. Candidate SHA: null; no handoff or live acceptance claimed. Resolve the exact evidence commit using `git log -1 --format=%H -- tests/unit/system-remediation/sr-push-001/outbox-boundary.test.ts`.

## Current behavior and required supervisor action

The module still binds `UnavailablePassengerPushPort`. No configured provider means failed/undelivered with a retry, as intended. An injected rejecting provider likewise remains undelivered; retry delay caps at 32 minutes. The expired-device test only models a rejecting transport; it does not validate a real device registry or provider response.

Two executable expected-failure regressions show acceptance cannot be completed solely inside the current adapter/port/module write scopes:

1. `MultiTaxiService.deliverPassengerNotification` sends an already-delivered input row again. There is no status guard or durable claim before sending. A transport-only cache would not protect worker restarts or multiple instances.
2. `persistPassengerNotificationOutcome` catches a repository write failure and still returns `delivered`. The repository update is unconditional by outbox ID, does not check affected rows, and stores neither provider identity nor provider message reference. An adapter cannot repair persistence performed after its return.

Supervisor must expand scope and add dependencies before these shared files are changed:

- `apps/api/src/modules/multi-taxi/multi-taxi.service.ts`: delivery eligibility and persistence failure propagation.
- `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`: durable claim/fencing and receipt persistence; coordinate multi-taxi writers after UV-EXEC-006.
- Assign any receipt/claim schema and shared contract changes through SR-CONTRACT with a dedicated migration and reviewed dependencies; current `PassengerPushDeliveryOutcome` does not contain `providerMessageRef`.
- Supply or identify the authoritative provider protocol and passenger-subject/device association contract. Source search found no existing FCM/APNs transport or device registry to reuse. The owner has not invented an HTTP gateway protocol or device token mapping.

The existing injectable `PassengerPushPort` permits the regression tests without introducing a second unauthoritative transport interface. Adapter implementation remains pending the above scope/contract decision. No product code was changed in this anchor.

## Commands and results

- `git fetch origin`: exit 0; dev advanced from `bd224425b800890f327bd89a4f3b5038c9f56fcf` to the base above.
- `git rebase origin/dev`: exit 0.
- Initial `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`: exit 1, missing local Vitest entry point.
- Initial `pnpm --filter @drts/api typecheck`: exit 1, missing TypeScript entry point.
- `pnpm install --frozen-lockfile --ignore-scripts`: rejected without TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
- `CI=true pnpm install --frozen-lockfile --ignore-scripts`: exit 0. Existing worktree node_modules links resolve to canonical dependencies; no package or lockfile edits.
- `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`: exit 0; **4 passed, 2 expected failures**, 6 total, 2.57 seconds. Expected failures document unresolved bugs; they are not acceptance passes. Remove `.fails` when the corresponding fixes are authorized and implemented.
- Subsequent `pnpm --filter @drts/api typecheck`: exit 2, missing `@drts/control-plane-auth` declarations. Dependency build and rerun follow below.
- `git diff --check`: exit 0 before evidence commit.

## Resource IDs and limits

Test-only IDs: `sr-push-001-outbox-001`, `sr-push-001-order-001`, `sr-push-001-passenger-001`, `sr-push-001-snapshot-001`, `sr-push-001-request-001`, `sr-push-001-test-receipt-001`. Provider name `test-double` is explicitly simulated.

Real provider account ID: null. Real provider message ID: null. Authorized device ID: null. Controlled HTTP receiver ID: null (not run). PostgreSQL integration resource ID: null (not run). No credentials were purchased, no external party was contacted, and no push was sent. Live/real-device acceptance remains with SR-LIVE-PUSH-001; this anchor does not release its gate.
