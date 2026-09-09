# SR-PUSH-001 — current-dev reproduction and scope blocker

## Dispatch verification — 2026-09-09 01:41 UTC

- Fresh fetched dev reference: `3062ea363769cc393e59384251f5aedc7e570ac5`.
  Tested branch SHA: `4e5abe74cb2c1c532daa051eab6c978a7b33ab1c`.
  Implementation candidate SHA: null; this is an evidence anchor only.
- `git fetch origin`: exit 0. `git rebase origin/dev`: exit 1, duplicate
  historical evidence/test add-add conflicts at `8b015a460`.
  `git rebase --abort`: exit 0; original published branch restored cleanly.
  No force push, stash, or replacement of newer dev content occurred.
- The merged history-repair packet at `6de31c41fa49d7089d87d42aa8f22378caa07858`
  describes a supervisor-routed successor branch. This dispatch still explicitly
  assigns the existing branch and worktree. Supervisor must apply that routing;
  another history investigation is unnecessary. Product gates remain separate.
- `git diff origin/dev HEAD -- apps/api/src/modules/multi-taxi/multi-taxi.service.ts apps/api/src/modules/multi-taxi/multi-taxi.repository.ts apps/api/src/modules/multi-taxi/passenger-push.port.ts apps/api/src/modules/multi-taxi/multi-taxi.module.ts`:
  exit 0, empty. These inspected push sources match fresh dev. Tests below ran
  at the branch SHA, not a fully rebased dev checkout.
- `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`: exit 0,
  4 passed / 2 expected failures, 6 total, 3.12 seconds. Duplicate delivery and
  swallowed persistence failure remain unresolved acceptance defects.
- Initial `pnpm --filter @drts/api typecheck`: exit 2, missing generated contracts
  and control-plane-auth declarations, with downstream errors.
  `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api typecheck`:
  exit 0. `git diff --check`: exit 0 before this evidence update.
- Canonical task readback still permits only the original five scopes and
  depends only on UV-EXEC-006. Before implementation, supervisor must grant
  service/repository scopes with writer sequencing and route the approved
  provider/device contract and durable claim/receipt allocation described in
  the existing planning packet. A completed history helper does not grant them.
- Test resource IDs remain those listed below. Real provider account/message,
  authorized device, controlled receiver and PostgreSQL integration resource
  IDs remain null. No live/device/receiver verification or product server was
  run. The readiness snapshot still lists missing provider/device evidence.


## Redispatch verification — 2026-09-09 after history repair

- Fetched `origin/dev`: `6de31c41fa49d7089d87d42aa8f22378caa07858` (exit 0).
  Tested branch SHA: `6f683d4ef3de7c98bc3825220d459ea334bee406`.
  `git diff origin/dev HEAD --` for passenger-push.port.ts, multi-taxi.module.ts,
  multi-taxi.service.ts and multi-taxi.repository.ts (all under
  apps/api/src/modules/multi-taxi) returned no differences, exit 0.
- `git rebase origin/dev`: exit 1, add/add conflicts in this evidence file and
  outbox-boundary.test.ts while replaying published anchors. `git rebase --abort`:
  exit 0; published ancestry retained. No force push or conflict-side replacement.
- History repair `aef3c7571a034b44db36cc9ae39dbf23b3bd2c6d` only changes its
  support packet citation. It supplies no product implementation or scope grant.
  Current task slice still grants only the original five paths and UV-EXEC-006
  dependency. The planning packet's provider/claim/receipt resume gates remain unmet.
- `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`: exit 0,
  4 passed, 2 expected failures, 6 total (5.62 seconds). Duplicate send and false
  durable delivery remain reproducible; expected failures are not acceptance.
- `pnpm --filter @drts/api typecheck`: exit 2, missing generated declarations for
  @drts/contracts and @drts/control-plane-auth with cascading errors. This run
  does not claim a passing typecheck. `git diff --check`: exit 0.
- Readiness still records missing provider account and authorized device.
  Resource IDs remain the test-only IDs below; live provider/message/device,
  controlled receiver and PostgreSQL resource IDs remain null. No live send,
  receiver, database integration or device validation was performed.
- Implementation candidate SHA remains null. This update is an evidence anchor;
  supervisor must grant service/repository scopes and dependencies and route the
  approved provider/device and durable claim/receipt contracts before implementation.
  History reconciliation alone must not release these product resume gates.

## Redispatch verification — 2026-09-08 after PR #1828

- Fresh `origin/dev` base: `a24045986ac29231d34657df3a343b02d9fbb770`.
  `git fetch origin` and `git rebase origin/dev`: exit 0.
- Inspected/tested code SHA: `26f862e9d` (rebased reproduction anchors).
  Published anchor ancestry was subsequently retained by a normal merge at
  `2d10084d9dbef57468ca4acfd7316c139e327749`; it changes no task code.
  Implementation candidate SHA remains null.
- The merged planning helper candidate `9ae18d49e1951e784dfb474ac1d878bc66c216a2`
  in PR #1828 explicitly routes follow-up and says product implementation remains
  blocked. Its merged packet and `PHASE1_OPEN_QUESTIONS.md` Q-SR-PUSH-001 do not
  approve a provider protocol, expand parent write scopes, or allocate claim/receipt
  contracts. The redispatched parent task slice still lists the original five
  write scopes and only UV-EXEC-006 as a dependency. A helper status of done is
  therefore insufficient to satisfy the documented parent resume gates.
- `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`: exit 0,
  4 passed and 2 expected failures, 6 total, 3.27 seconds. Both defects below
  still reproduce; expected failures are not completed acceptance.
- Initial `pnpm --filter @drts/api typecheck`: exit 2 because generated
  `@drts/control-plane-auth` declarations were missing; dependency build and
  rerun: `pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api typecheck`
  exited 0. `git diff --check`: exit 0.
- Resource IDs and live/receiver limitations below remain unchanged. No real
  provider, controlled receiver, PostgreSQL integration, or device test was run.
- Next action remains Supervisor/Chairman scope and contract routing as specified
  in `support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md`.
  No shared product writes or implementation handoff are justified yet.

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
- `pnpm --filter @drts/control-plane-auth build`: exit 0; then `pnpm --filter @drts/api typecheck`: exit 0.
- `pnpm exec prettier --write tests/unit/system-remediation/sr-push-001/outbox-boundary.test.ts docs/04-uat/system-remediation-20260906/SR-PUSH-001.md`: exit 0.
- `pnpm exec eslint tests/unit/system-remediation/sr-push-001/outbox-boundary.test.ts --max-warnings=0`: exit 0.
- First anchor `8b015a460` committed and `git push -u origin codex2/sr-push-001` exited 0 (ordinary new-branch push). Subsequent evidence/formatting commit remains an anchor, not a candidate.

## Resource IDs and limits

Test-only IDs: `sr-push-001-outbox-001`, `sr-push-001-order-001`, `sr-push-001-passenger-001`, `sr-push-001-snapshot-001`, `sr-push-001-request-001`, `sr-push-001-test-receipt-001`. Provider name `test-double` is explicitly simulated.

Real provider account ID: null. Real provider message ID: null. Authorized device ID: null. Controlled HTTP receiver ID: null (not run). PostgreSQL integration resource ID: null (not run). No credentials were purchased, no external party was contacted, and no push was sent. Live/real-device acceptance remains with SR-LIVE-PUSH-001; this anchor does not release its gate.
