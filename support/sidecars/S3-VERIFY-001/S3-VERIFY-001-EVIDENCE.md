# S3-VERIFY-001 — Fleet G S-3 Production Verification Evidence

- Task: `S3-VERIFY-001`
- Owner: `Claude2` (reassigned from `Codex`, 2026-07-25T11:39Z)
- Reviewer: `Claude`
- Branch: `claude2/s3-verify-001`
- Verified head: rebased onto `origin/dev` @ `a03e32ea2` (`P5-RATE-001`, #1152)
- Date: `2026-07-25`

This packet answers review round **R1 REOPEN**
(`S3-VERIFY-001-REVIEW-R1.md`), which found the previous verification had been
run against a head 18 commits behind `dev`. Every command below was run at the
rebased tip, in this worktree, against a real Postgres and a real API process.

**Scope discipline.** Per the brief, S-3 was not rebuilt. One defect found
during verification was fixed because the acceptance evidence could not be
produced without it; it is called out explicitly in §2 rather than folded into
a green result.

---

## 0. Headline

| #   | Acceptance                                      | Verdict                                      |
| --- | ----------------------------------------------- | -------------------------------------------- |
| 1   | current-head E2E green                          | **PASS**                                     |
| 2   | offline replay verified on Android / iOS        | **`blocked_ext`** (no device; honest)        |
| 3   | attachment scan verified                        | **PASS** (local controlled providers)        |
| 4   | p95 measured not asserted                       | **MEASURED** local; production `blocked_ext` |
| 5   | forbidden-vocab scan green                      | **FAIL — 3 blocking findings**               |
| 6   | screenshot evidence labeled with runtime source | **PASS** for Ops; Driver `blocked_ext`       |
| 7   | reviewer PASS                                   | pending                                      |

Two things a reviewer should look at first:

1. **§2 — a P0 defect that made the Ops SOS queue permanently empty.** Found by
   this verification, fixed, and pinned with a regression test.
2. **§6 — acceptance item 5 does not pass.** Three forbidden terms render on the
   S-3 Driver SOS screen. Closing them needs an S-3 design decision, which this
   task is not allowed to make, so it is recorded as a board-level gap.

---

## 1. Environment and honesty boundary

The worktree's `node_modules` were symlinks into the canonical root, whose
`@drts/*` workspace links all pointed at `.artifacts/worktrees/auto/claude2-p5-pax-001`
— a worktree that had since been pruned. Every workspace-package link in the
shared tree was dangling, so nothing importing `@drts/contracts` could build.
Repointing the shared links at this branch would have silently built other lanes
against S3-VERIFY-001 code, so instead the worktree was given its own isolated
install (`pnpm install --frozen-lockfile`), after which `@drts/*` resolves
relatively inside this worktree only.

| Layer           | What was real                                                   | What was NOT real                                     |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| API             | current-head `@drts/api` built from this worktree, real process | —                                                     |
| Database        | real Postgres 16 + PostGIS, `infra/migrations` V0001–V0063      | —                                                     |
| Object store    | real HTTP, real presigned SigV4 PUT                             | **local controlled endpoint**, not S3                 |
| Malware scanner | real HTTP, real `2026-07-24` JSON contract                      | **local controlled endpoint**, not a real scanner     |
| Ops console     | current-head `ops-console-web`, real API, real rows             | `next dev`, not a production build behind ingress     |
| Driver app      | unit layer only                                                 | **no Android/iOS device or emulator existed**         |
| Alert latency   | real end-to-end timestamps through API + Postgres               | loopback; **no production network, browser, or load** |

Databases are name-isolated (`drts_s3_verify_001`, `drts_s3_verify_ui`) so no
run touched the shared `drts_fleet_platform` dev database.

No result in this packet is production evidence.

---

## 2. Defect found and fixed: the Ops SOS queue rendered zero rows

Severity: **P0 for the S-3 feature.** The Ops SOS queue (`S3-O02`) is the
primary operator surface for the entire S-3 emergency flow.

The API generates event numbers in `nextEventNo`
(`apps/api/src/modules/driver-sos/driver-sos.service.ts:1482-1485`):

```ts
const compact = now.replace(/\D/g, "").slice(0, 14);
return `SOS-${compact}-${randomUUID().slice(0, 6).toUpperCase()}`;
// e.g. SOS-20260725122716-F67B15
```

`apps/ops-console-web/lib/sos-view-model.ts:10` matched:

```ts
const SOS_EVENT_NO_PATTERN = /SOS-\d{8}-\d{4}/;
```

The timestamp is 14 digits, not 8, and the suffix is 6 hex characters, not 4
digits, so the pattern can never match a real event number. Because
`isSosIncident()` gates the whole queue on it, **every real SOS incident was
filtered out and the queue rendered permanently empty.**

Two consequences beyond the empty table:

- `GENERATED_DESCRIPTION_PATTERN` (same wrong shape) also never matched, so the
  API's own boilerplate description was shown to Ops as if it were a
  driver-written supplement.
- `collectUnreportedSosIncidentIds()` reads the filtered rows, so the real Ops
  console **never sends `POST /ops/driver-sos/alerts/rendered`**. The
  alert-latency metric that acceptance item 4 depends on could therefore never
  receive a sample from the real UI in production.

### Why nothing caught it

`apps/ops-console-web/tests/unit/sos-view-model.test.ts` used a hand-written
fixture, `SOS-20260720-0012`, in the same wrong shape as the regex. The view
model and its test agreed with each other and both disagreed with the API, and
no test crossed that seam. E2E-017 passes because it verifies the API, not this
client-side view model.

### Fix

`sos-view-model.ts` now derives both patterns from one canonical segment,
`SOS-\d{14}-[0-9A-F]{6}`, with the API generator cited in a comment. The test
fixtures were corrected to the real format, and a new
`SOS event number contract with the API generator` block builds the event number
the same way the API does, so a future divergence on either side fails the test.

Proof the guard is not vacuous — with the old pattern restored, **all 6 tests
fail**; with the fix, all 6 pass:

```
# old pattern            # fixed
Tests  6 failed (6)      Tests  6 passed (6)
```

Full app suite after the fix: `Test Files 7 passed (7)  Tests 32 passed (32)`,
and `pnpm --filter @drts/ops-console-web typecheck` is clean.

The before/after is visible in the evidence images: the first capture attempt
settled to an empty table; `screenshots/S3-O02-sos-queue.png` now shows the real
event `SOS-20260725122716-F67B15` in both the critical-alert overlay and the
queue row.

---

## 3. Acceptance 1 — current-head E2E

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_s3_verify_001 \
API_PORT=3971 E2E_API_URL=http://localhost:3971 \
./tests/e2e/run-e2e-hermetic.sh 017
```

```
▶ Running: E2E-017-driver-sos-incident
  ✓ PASS  E2E-017-driver-sos-incident
[hermetic] PASS (1): 017
```

Chain evidence emitted by the run:

```
E2E-017 | driver | incidentId=INC-000001
E2E-017 | driver | sosEventId=cbc50b4b-5533-497f-9004-2ef6472b6571
E2E-017 | driver | eventNo=SOS-20260725121121-43D1BD
E2E-017 | driver | fleetReportConfirmedAt=2026-07-25T12:11:21.684Z
E2E-017 | driver | attachmentStorageState=unavailable
E2E-017 | ops    | opsAlertRenderedAt=2026-07-25T12:11:21.856Z
E2E-017 | ops    | alertToOpsLatencyMs=172
```

`attachmentStorageState=unavailable` is the correct fail-closed default when no
attachment provider is configured; §5 runs the same chain with providers bound.

The full hermetic gate (`./tests/e2e/run-e2e-hermetic.sh`, all non-deferred
scenarios) was also run at this tip — see §9 for its result.

---

## 4. Acceptance 2 — offline replay: honest `blocked_ext`

No Android or iOS execution was possible on this host:

```
which adb emulator xcrun simctl   -> all absent
ANDROID_HOME / ANDROID_SDK_ROOT   -> unset
```

The host is a Linux VM, so an iOS simulator cannot exist on it at all. Per the
brief, this is recorded as an honest `blocked_ext` rather than substituted with
a local mock.

What _is_ repository-verifiable was run, and is reported as the unit layer it is:

```bash
cd apps/driver-app && pnpm exec vitest run \
  tests/unit/driver-sos-outbox.test.ts \
  tests/unit/driver-sos-attachment-upload.test.ts \
  tests/unit/driver-location-offline-queue.test.ts \
  tests/unit/pending-completion-replay.test.ts
# Test Files  4 passed (4)   Tests  14 passed (14)
```

These cover the durable-outbox state machine — pending case creation, submitted
receipt + incident correlation, retryable failure with supplemental notes
preserved, and retry-scan without re-upload.

**They do not cover, and must not be read as covering:** SQLite persistence
across an app kill/restart, OS-level backgrounding, real radio loss and
recovery, or native push delivery. Android and iOS physical offline replay
remains unproven.

---

## 5. Acceptance 3 — attachment upload + scan verified at runtime

```bash
./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh attachments
```

The harness binds the landed `S3DriverSosAttachmentStorageAdapter` and
`HttpsJsonDriverSosAttachmentScannerAdapter` to local controlled endpoints
(`attachment-provider-stubs.mjs`) that implement the real
`DRIVER_SOS_SCANNER_CONTRACT_VERSION = "2026-07-24"` request/response contract,
then drives the real routes over real HTTP. 16 checks, all green:

```
[PASS] upload intent state (ready)
[PASS] upload intent provider (s3-compatible)
[PASS] upload URL is presigned SigV4 and expires (X-Amz-Expires present)
[PASS] presigned PUT status (200)
[PASS] confirm state (confirmed)
[PASS] persisted checksum is provider-computed, not client-supplied (9eb4ac49…d560b)
[PASS] persisted size is provider-computed, not client-supplied (38)
[PASS] clean scan status (clean)
[PASS] scanner provider recorded (https-json-malware-scanner)
[PASS] listed scan status persists (clean)
[PASS] listed checksum persists (9eb4ac49…d560b)
[PASS] infected scan status (infected)
[PASS] first scan attempt errors (error)
[PASS] first scan attempt is counted (1)
[PASS] retry-scan reaches clean without a second upload (clean)
[PASS] retry is audited as a second attempt (2)
[PASS] disallowed content type rejected (HTTP 400)
```

The checksum check is the substantive one: the client deliberately sends
`checksumSha256: "0000…0000"` and `fileSize: 999999`, and the server persists
`9eb4ac49…d560b` / `38` — the values it computed by streaming the stored object
itself (`s3-driver-sos-attachment-storage.adapter.ts:105-129`). A client cannot
forge either field.

Reproduced twice, on two independently reset databases, with identical results.

**Still `blocked_ext`:** binding to a real S3 bucket and a real malware-scanner
provider, provider credentials, quarantine storage, and vendor scan reports.

---

## 6. Acceptance 5 — forbidden vocabulary: **FAIL**

Canonical list: `source_specs/02_ui_visual_design_team_brief_20260720.md` §1.3,
14 terms, binding on "所有 P-5／S-3 相關畫面".

No scanner existed, so one was written:
`support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs`. It parses TS/TSX
with the TypeScript AST and classifies each string by position, because a flat
grep fails in both directions — it would pass a screen whose forbidden word sits
in a multi-line JSX child, and fail a screen for an internal `forwardedOrderId`
field no user can see. Only strings that reach rendered copy are BLOCKING.

```bash
node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs
```

```
Scope:  S-3 Driver screens (S3-01..S3-11); S-3 Ops screens (S3-O01..S3-O06);
        P-5 Passenger screens (P5-01..P5-12, P5-A01..A05)
Files:  56

BLOCKING (forbidden term reaches rendered copy): 3
  apps/driver-app/app/sos.tsx:1146 [copy-string]   {forwarded}      "forwarded order"
  apps/driver-app/app/sos.tsx:1159 [copy-string]   {mirror}         "mirror order"
  apps/driver-app/app/sos.tsx:1162 [copy-string]   {native status}  "native status"
```

All three render on the S-3 Driver SOS Home screen, in the "當前訂單情境" card:
a `Pill` reading `forwarded order`, and two `DL` labels reading `mirror order`
and `native status`. This also contradicts the `multi_taxi_direct` runtime
profile's `forbiddenCapabilities: [forwarded_order_ui, external_platform_badge]`.

`sos.tsx` has **no runtime-profile gate** — `forwarded` is derived at line 205
from `!isOwnedPlatformCode(selectedTask.sourcePlatform)` and the card renders
unconditionally, so a `multi_taxi_direct` driver sees multi-platform vocabulary.

**Not fixed here, deliberately.** Closing it requires deciding whether the card
should be realm-conditional or the labels renamed — an S-3 design decision, and
the brief forbids this task from making one. Recorded as a board-level gap, per
the alternative stated in R1's "Required for re-review" item 4:

```
S3-FIX-DRIVER-SOS-VOCAB-001   backlog   owner=Codex   reviewer=Claude
```

Its acceptance explicitly refuses a cosmetic rename as closure and requires the
scanner to reach 0 BLOCKING, so the gap cannot be retired by relabelling alone.
This is on `ai-status.json`, not only in this file.

### Scope honesty

Scoping to the §2.1–2.4 screen catalogue rather than to whole app directories is
a judgement call, so the excluded realms are re-scanned and reported:

```bash
node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs --audit-excluded
# BLOCKING: 30  (29 safety-operator.tsx, 1 jobs.tsx)
```

Those 29 are 安全員/接管/FSD/Tesla in `safety-operator.tsx`, the Phase-2 Tesla/FSD
sandbox realm where they are the domain vocabulary, and 1 is `forwarded` copy in
`jobs.tsx`, the standard-taxi multi-platform realm that legitimately aggregates.
Neither is a P-5/S-3 screen. Scanning all of `apps/driver-app` instead yields 371
findings that are overwhelmingly correct usage in the wrong scope — which is how
a previous round reached `verified_with_gap` without a precise list.

The 129 INFO findings were checked, not waved through: the `forwarded_*` strings
in `trip.tsx` are switch-case state codes mapped to Chinese labels
(`"平台訂單可接單"` etc.) and never render, and `ForwardedStatusBadge` is not
imported by any S-3 screen.

---

## 7. Acceptance 4 — alert-to-Ops p95 measured, not asserted

```bash
SAMPLES=50 ./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh latency
```

Measured over 50 real SOS submissions, each driving
`POST /driver/sos-events` → `POST /ops/driver-sos/alerts/rendered` and reading
the server-computed `alertToOpsLatencyMs`:

```
n   = 50
min = 24 ms
p50 = 26 ms
p90 = 27 ms
p95 = 29 ms
max = 32 ms
```

This is a **measured distribution, not an assertion** — the acceptance wording.
It is local hermetic loopback: `renderedAt` comes from the shell clock standing
in for the Ops paint callback, and there is no production network, browser
render, or load.

**The production `p95 ≤ 5s` criterion stays `blocked_ext`**, and §2 explains why
that number could not have been collected in production at all before the
sos-view-model fix: the real Ops console never sent an alert-rendered receipt.

---

## 8. Acceptance 6 — screenshot evidence labeled with runtime source

Captured by `tests/e2e/s3-verify-ops-evidence.spec.ts` via
`playwright.s3-verify-ops-evidence.config.ts`, against current-head
`ops-console-web` talking to the real current-head API and real Postgres rows
written by this task's own runtime run. **No `page.route()` interception and no
fixture injection** — unlike the sibling P5 capture specs, which mock the API.

| File                     | Screen                           | Shows                                                                                           |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `S3-O02-sos-queue.png`   | SOS queue + S3-O01 alert overlay | real `SOS-20260725122716-F67B15`, 治安事件·重大, driver/vehicle, `確認接手`, badge `1 件待確認` |
| `S3-O05-sos-records.png` | Ops audit records                | real audit rows incl. `record_ops_alert_rendered` → `INC-000001`                                |
| `S3-O03-sos-board.png`   | SOS board                        | settled state                                                                                   |

Runtime source is recorded two ways so an image cannot be separated from its
provenance: stamped **into** each PNG as a red banner, and written to
`screenshots/manifest.json` with `"productionEvidence": false`.

Both non-vacuity traps were hit and fixed during capture. The first queue
capture settled to an empty table (the §2 defect). The first records/board
captures screenshotted the `載入中…` skeleton — `networkidle` fires before these
client fetches resolve. Every capture now waits for the loading state to clear,
and the queue additionally **asserts** a real `SOS-\d{14}-[0-9A-F]{6}` is
visible, so the spec fails rather than producing a decorative PNG.

**Driver S-3 screens (S3-01..S3-11) are `blocked_ext`** — no Android/iOS runtime
exists here, and Expo web would be a different runtime than the RN device target.
The DRV-UI-010 driver PNGs in the repo are from an older head and are **not**
adopted as this task's evidence.

### Incidental finding

`/sos/board` calls `GET /api/driver/tasks` under the Ops bootstrap identity and
receives `403 AUTH_SCOPE_DENIED` (`required: driver:read`, not granted to
`ops_user`). Visible as `reject_authorization` rows in
`S3-O05-sos-records.png`. Not fixed — it needs a scope-boundary decision, so it
is on the board rather than only here:

```
S3-FIX-OPS-SOS-BOARD-SCOPE-001   backlog   owner=Codex   reviewer=Claude
```

---

## 9. Full hermetic E2E gate

```bash
DATABASE_URL=…/drts_s3_verify_001 API_PORT=3971 ./tests/e2e/run-e2e-hermetic.sh
```

<!-- RESULT-PENDING -->

---

## 10. Scope question carried from R1

R1's second finding stands: the board records all seven acceptance items against
`S3-VERIFY-001`, while the prior evidence report deferred four of them to
`S3-VERIFY-002..005`, none of which exist as tasks. This round did **not**
resolve that by narrowing scope in prose. All seven items are reported above
under `S3-VERIFY-001`, with the two genuinely external ones marked `blocked_ext`
and the one failing item marked FAIL.

Creating `S3-VERIFY-002..005` remains a supervisor/chair action. It is no longer
needed to carry this task's findings, though: the two things this round found but
was not allowed to fix are now their own board tasks
(`S3-FIX-DRIVER-SOS-VOCAB-001`, `S3-FIX-OPS-SOS-BOARD-SCOPE-001`), so no
official remaining work is parked in sidecar prose — the condition
`AI_COLLABORATION_GUIDE.md` §0.5 actually cares about.

---

## 11. What a reviewer should re-run

```bash
git fetch origin && git log --oneline -1 origin/dev      # confirm base
pnpm install --frozen-lockfile                            # worktree-local
node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs   # expect exit 1, 3 findings
node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs --audit-excluded
cd apps/ops-console-web && pnpm exec vitest run tests/unit/sos-view-model.test.ts
pnpm --filter @drts/ops-console-web typecheck
./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh attachments
SAMPLES=50 ./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh latency
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_s3_verify_001 \
  API_PORT=3971 E2E_API_URL=http://localhost:3971 ./tests/e2e/run-e2e-hermetic.sh 017
```

To re-shoot the Ops evidence, leave the API up
(`… run-attachment-verification.sh shell` with `SKIP_DB_RESET=1`) and run
`pnpm exec playwright test --config=playwright.s3-verify-ops-evidence.config.ts`.

To confirm the §2 regression guard bites, set `SOS_EVENT_NO_SEGMENT` back to
`SOS-\d{8}-\d{4}` and re-run the view-model test: all 6 cases must fail.
