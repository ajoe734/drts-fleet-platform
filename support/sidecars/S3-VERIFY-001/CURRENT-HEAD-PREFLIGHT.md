# S3-VERIFY-001 Current-Head Preflight

## Scope

- Task: `S3-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Claude2`
- Inspected commit: `814d867f5bc6687ba36a2b7bd1067e0934f5d8bc`
- Inspection date: `2026-07-25`

## Current-Head Inventory

| Acceptance slice | Status | Evidence anchors |
| --- | --- | --- |
| current-head driver/API E2E | `verified_repo_local` | `tests/e2e/E2E-017-driver-sos-incident.sh` passed on `2026-07-25` against repo-local API runtime `http://localhost:3011` (health `200 OK`); evidence: `incidentId=INC-000002`, `sosEventId=a384287d-8ea1-4ea6-88a1-0cbc7e998b26`, `eventNo=SOS-20260725020324-2B72D9`, driver incident-list still `403` |
| API SOS create + replay idempotency | `verified` | `apps/api/tests/integration/int-s3-001-driver-sos-idempotency.test.ts:225-295` |
| Driver offline durable outbox + replay state | `verified` | `apps/driver-app/tests/unit/driver-sos-outbox.test.ts:38-168` |
| Driver SOS screen flow + forwarded-context projection | `verified` | `apps/driver-app/tests/unit/incident-screen.test.ts:101-224`, `apps/driver-app/app/incident.tsx:180-216` |
| Ops incident list/timeline/service-recovery projection | `verified` | `apps/api/tests/unit/incident.controller.test.ts:20-274` |
| Ops incident event stream publish | `verified` | `apps/api/tests/unit/ops-dispatch-events.service.test.ts:59-216` |
| Screenshot evidence with runtime source label | `partial` | `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:71-72,91-94`, `support/sidecars/DRV-UI-010/ui-text-snapshots.md:83-95` |
| Android / iOS physical offline replay | `blocked_ext` | No emulator / device execution in this worker; task brief forbids replacing device evidence with local mock. |
| Attachment security scan | `missing_evidence` | `infra/migrations/V0052__s3_driver_sos.sql:83-103` creates `safety.driver_sos_attachments`, but `packages/contracts/src/phase1-p5-s3-multi-taxi.ts:627-639` defines `SubmitDriverSosEventCommand` without attachment fields, `apps/api/src/modules/driver-sos/driver-sos.controller.ts:12-25` exposes only `POST /driver/sos-events`, and `apps/api/src/modules/driver-sos/driver-sos.repository.ts:80-92,389-501` persists only events/timelines/outbox. `apps/driver-app/app/sos.tsx:334-361,672-761,1086-1196` plus `apps/driver-app/lib/driver-sos-outbox.ts:131-218,348-364` still show attachment drafts staying local, while `buildDriverSosSubmitCommand` at `apps/driver-app/lib/driver-sos-outbox.ts:208-220` sends no attachment metadata. |
| Alert p95 measured in production | `blocked_ext` | No production observability access in this worker; local unit/integration timings are not acceptable production proof. |
| Forbidden-vocabulary scan | `verified_with_gap` | Android incident text snapshot is clean for the forbidden list, but mirrored/forwarded wording still exists outside the incident surface. |

## Commands Executed

```bash
pnpm exec vitest run tests/integration/int-s3-001-driver-sos-idempotency.test.ts tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/incident.controller.test.ts tests/unit/ops-dispatch-events.service.test.ts tests/unit/incident-escalation-service-recovery.test.ts --reporter=dot
```

Executed in: `apps/api`

Result: `PASS` (`6` files, `45` tests) on inspected commit `814d867f5bc6687ba36a2b7bd1067e0934f5d8bc`

```bash
pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/incident-screen.test.ts --reporter=dot
```

Executed in: `apps/driver-app`

Result: `PASS` (`2` files, `6` tests) on inspected commit `814d867f5bc6687ba36a2b7bd1067e0934f5d8bc`

Note: the driver-app run emitted `react-test-renderer` deprecation plus `act(...)` environment warnings, but the process still exited `0` and all assertions passed.

```bash
source /tmp/drts-s3v-env.sh
curl -sS -m 5 -D - http://localhost:3011/health
bash tests/e2e/E2E-017-driver-sos-incident.sh
```

Executed at repo root.

Result: repo-local current-head API runtime on `http://localhost:3011` returned
health `200 OK` with `map_provider.environment=local` and
`map_provider.effective_backend=mock`, and `E2E-017` passed with `incidentId=INC-000002`,
`sosEventId=a384287d-8ea1-4ea6-88a1-0cbc7e998b26`,
`eventNo=SOS-20260725020324-2B72D9`; driver incident-list access remained
forbidden (`403`).

```bash
git grep -nE "attachment|attachments|presign|checksum|malware|clam|virus|content-type|mime|scan" -- apps/api/src/modules/driver-sos apps/api/src/modules/incident apps/api/tests apps/driver-app support/sidecars/DRV-UI-010 support/sidecars/S3-VERIFY-001 | sed -n '1,260p'
```

Executed at repo root.

Result: matches again confirm only local driver-app attachment draft
persistence under `apps/driver-app/app/sos.tsx` and
`apps/driver-app/lib/driver-sos-outbox.ts`, plus non-S3 attachment checksum
flows in other domains such as Fleet Partner onboarding / accident
investigation. Current head does contain the attachment schema in
`infra/migrations/V0052__s3_driver_sos.sql`, but no S-3-specific presign /
checksum / malware-scan runtime path was found under `apps/api/src/modules/driver-sos`,
`apps/api/src/modules/incident`, or related tests.

```bash
git grep -nE "FSD|自駕|Tesla|sandbox|safety operator|external platform badge|forwarded|mirror" -- apps/driver-app support/sidecars/DRV-UI-010 tests/e2e support/sidecars/S3-VERIFY-001 | sed -n '1,260p'
```

Executed at repo root.

Result: the captured incident surface still stays clean for `FSD`, `自駕`, `Tesla`, `sandbox`, `safety operator`, and `external platform badge`, but broader current-head driver-app surfaces still contain `forwarded` / `mirror` strings in SOS-adjacent context and other screens.

## Remaining Delta

Current `HEAD` was re-audited on `2026-07-25`. Relative to
`b2128bfe34a8c48469e7db9286cc94d8f7cc6c0c`, the branch only added the
task-local anchor commit `814d867f5bc6687ba36a2b7bd1067e0934f5d8bc`
(`wip(S3-VERIFY-001): anchor current-head evidence metadata`); no
product/runtime files changed, so the verification conclusions below still
apply at `814d867f5bc6687ba36a2b7bd1067e0934f5d8bc`.

1. `S3-VERIFY-002` physical-device offline replay evidence is still required for Android and iOS. This worker cannot produce honest device proof.
2. `S3-VERIFY-003` attachment security verification is not yet evidenced for S-3. Current head exposes local attachment draft / supplement UX in `apps/driver-app/app/sos.tsx` and durable local persistence in `apps/driver-app/lib/driver-sos-outbox.ts`, but the submit command still omits attachment fields and the repo scan did not locate a driver-SOS upload / presign / malware-scan verification path.
3. `S3-VERIFY-004` requires production-grade latency measurement for `fleetReportConfirmedAt -> opsAlertRenderedAt`; local test output is insufficient.
4. `S3-VERIFY-005` is only partially satisfied here: the Android incident screenshot text is clean, but broader driver-app vocabulary still contains `forwarded` / `mirror` on non-SOS surfaces such as `support/sidecars/DRV-UI-010/ui-text-snapshots.md:52`.
