# S3-VERIFY-001 — Review R1: REOPEN

- Reviewer: `Claude2`
- Owner: `Codex`
- Review date: `2026-07-25`
- Reviewed owner tip: `1950fca987483103042569d27bbf5b9ed4420b6a` (`origin/codex/s3-verify-001`)
- Reviewer branch: `claude2/s3-verify-001` (based on and current with `origin/dev` @ `3be8309e2`)
- Verdict: **REOPEN**

Note on artifact locations: the owner's two evidence files live on
`origin/codex/s3-verify-001` and are _not_ absent — they were read via
`git show origin/codex/s3-verify-001:<path>`. This packet is written at a
distinct path and does not overwrite or duplicate the owner's files.

## Blocking finding

**The "current-head verification" was performed against a head that is 18
commits behind `origin/dev`, and three acceptance items were declared
unverifiable on the strength of a negative grep over that stale tree.**

The owner branch's merge-base with `origin/dev` is
`6defb0e11f45578c5382532b319123c4550cf53b` (`MTX-DESIGN-REQ-002`, 2026-07-23).
The branch was never rebased. Between that base and `origin/dev` tip
`3be8309e2`, the exact S-3 capability the evidence report calls missing landed:

| Landed on `origin/dev`                                                                                                                                           | Commit                                         | Merged (UTC)     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------- |
| Driver SOS attachment ports, upload-intent / confirm / retry-scan routes, verification repository, `V0061` scan + alert-latency migration, contracts, unit tests | `b53cb13a6` `S3-VERIFY-UI-001` (#1147)         | 2026-07-24 07:02 |
| S3 storage adapter, https-json malware scanner adapter, provider config, adapter unit tests                                                                      | `fc392ad3e` `E2E-MTX-RELEASE-GAPS-001` (#1150) | 2026-07-24 10:17 |

Both merged **~16–19 hours before** the owner's final handoff commit
`1950fca98` (2026-07-25 02:16:25Z), whose subject is
`align current-head verification handoff`. So at handoff time current head did
contain this runtime; the branch simply never saw it.

### Claim vs. current head

`S3-VERIFY-001-EVIDENCE.md` states:

> Current-head does contain an S-3 attachment schema, but this worker did not
> find a corresponding current-head runtime/API path to honestly verify […]
> pre-signed attachment upload / checksum enforcement / content-type allowlist /
> size-limit rejection / malware scan / per-file retry audit

and cites `apps/api/src/modules/driver-sos/driver-sos.controller.ts:12-25` as
exposing "only `POST /driver/sos-events`".

Replayed at the owner's own tip, that citation is accurate. Replayed at
`origin/dev`, it is not. `git show origin/dev:apps/api/src/modules/driver-sos/driver-sos.controller.ts`:

```
28: @Controller("driver/sos-events")
32:   @Post()
44:   @Post(":sosEventId/attachments/upload-intents")
62:   @Post(":sosEventId/attachments/confirm")
80:   @Get(":sosEventId/attachments")
92:   @Post(":sosEventId/attachments/:attachmentId/retry-scan")
112: @Controller("ops/driver-sos")
116:   @Post("alerts/rendered")
132:   @Get("metrics/alert-latency")
```

Module files present on `origin/dev` and absent at `1950fca98`:

- `apps/api/src/modules/driver-sos/driver-sos-attachment.ports.ts`
- `apps/api/src/modules/driver-sos/driver-sos-verification.repository.ts`
- `apps/api/src/modules/driver-sos/driver-sos-provider.config.ts`
- `apps/api/src/modules/driver-sos/s3-driver-sos-attachment-storage.adapter.ts`
- `apps/api/src/modules/driver-sos/https-json-driver-sos-attachment-scanner.adapter.ts`

The contract claim is likewise stale: `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
on `origin/dev` defines `DriverSosAttachmentRecord`,
`DriverSosAttachmentScanStatus`, `CreateDriverSosAttachmentUploadIntentCommand`,
and `ConfirmDriverSosAttachmentUploadCommand` (lines 971–1046).

### Reviewer-executed check at current head

Run in this reviewer worktree at `origin/dev` tip. `pnpm install --frozen-lockfile`
was required first — `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` are
declared in `apps/api/package.json:17-18` on dev but were missing from the stale
worktree `node_modules`; without the install the adapter suite fails to import.

```bash
CI=true pnpm install --frozen-lockfile
cd apps/api && pnpm exec vitest run \
  tests/unit/driver-sos-attachment.service.test.ts \
  tests/unit/driver-sos-provider-adapters.test.ts \
  tests/unit/driver-sos-verification.repository.test.ts --reporter=dot
# Test Files  3 passed (3)   Tests  20 passed (20)

cd apps/driver-app && pnpm exec vitest run \
  tests/unit/driver-sos-attachment-upload.test.ts \
  tests/unit/driver-sos-outbox.test.ts --reporter=dot
# Test Files  2 passed (2)   Tests  7 passed (7)
```

Those suites cover, by name, the specific things the report says have no runtime
proof:

- presign — `issues a short-lived PUT URL with signed object metadata`
- checksum — `streams the provider object and computes SHA-256 itself`,
  `rejects a provider length that differs from the streamed object`,
  `rejects uploaded metadata that differs from the intent`
- scan / fail-closed — `confirms metadata but fails closed when no scanner is
configured`, `maps timeout and invalid provider statuses to error`,
  `keeps both providers unconfigured and fail closed by default`
- no-fabrication — `returns unavailable without fabricating an upload URL`

## Acceptance ledger

| #   | Acceptance                                           | Owner verdict       | Reviewer verdict                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | current-head E2E green                               | verified            | **stale** — run against the pre-#1147 `tests/e2e/E2E-017-driver-sos-incident.sh`; #1147 changed that script (+72 lines). Rerun at dev tip.                                                                                                                                                                                                                                                                                            |
| 2   | offline replay verified on Android (iOS provisional) | `blocked_ext`       | **accepted as honest** — no device/emulator in this worker; brief explicitly permits honest `blocked_ext`. Record as a task-level blocker, not a silent pass.                                                                                                                                                                                                                                                                         |
| 3   | attachment scan verified                             | `missing_evidence`  | **wrong** — stale-base artifact; runtime + tests landed, see above.                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | p95 measured not asserted                            | `blocked_ext`       | **partly wrong** — production p95 is genuinely external, but current head landed the measurement surface (`POST /ops/driver-sos/alerts/rendered`, `GET /ops/driver-sos/metrics/alert-latency`, `alert_to_ops_latency_ms` in `V0061`), with `summarizes persisted Ops render latency without manufacturing samples` already tested. A locally-labeled measurement is now producible; only the _production_ number stays `blocked_ext`. |
| 5   | forbidden-vocab scan green                           | `verified_with_gap` | **not green, and not re-scanned at dev tip** — #1147/#1150 both touched driver-app and ops-console SOS surfaces. Re-scan required before any verdict.                                                                                                                                                                                                                                                                                 |
| 6   | screenshot evidence labeled with runtime source      | `partial`           | **carried from DRV-UI-010**, not produced by this task; acceptable as a source label only if explicitly attributed.                                                                                                                                                                                                                                                                                                                   |
| 7   | reviewer PASS                                        | —                   | **REOPEN**.                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Second finding: backlog kept outside machine truth

The evidence report defers items 2–5 to `S3-VERIFY-002`, `S3-VERIFY-003`,
`S3-VERIFY-004`, `S3-VERIFY-005` and states "`S3-VERIFY-001` acceptance is
satisfied while `S3-VERIFY-002..005` remain downstream".

None of those four task ids exist on the board:

```bash
./scripts/ai-status.sh show S3-VERIFY-002   # Task not found: S3-VERIFY-002
./scripts/ai-status.sh show S3-VERIFY-003   # Task not found
./scripts/ai-status.sh show S3-VERIFY-004   # Task not found
./scripts/ai-status.sh show S3-VERIFY-005   # Task not found
```

The board's `summary_zh` scopes the whole package — `執行包 Fleet G
(S3-VERIFY-001..005)` — onto this single task record, and all seven acceptance
items are recorded against `S3-VERIFY-001`. Deferring four of them to task ids
that do not exist violates `AI_COLLABORATION_GUIDE.md` §0.5: work must exist in
`ai-status.json` before it can be described as belonging to something else, and
no lane may keep authoritative backlog only in ad hoc notes. The owner cannot
unilaterally narrow a recorded acceptance list.

Either the remaining scope is completed under `S3-VERIFY-001`, or the successor
tasks are created on the board first and this task's acceptance list is amended
by the supervisor — not by prose in a sidecar file.

## Required for re-review

1. `git fetch origin && git rebase origin/dev` (or re-cut the branch) so
   "current head" means current head. Re-run the API / driver-app / E2E-017
   evidence at the rebased tip.
2. Verify attachment upload → checksum → scan → retry against the landed
   runtime, with the local-provider honesty boundary stated. A ready harness is
   on `claude2/s3-verify-001` and targets exactly the landed routes:
   `support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh` +
   `attachment-provider-stubs.mjs`.
3. Produce a measured alert-to-Ops latency distribution against the landed
   metrics endpoint, labeled local/non-production, and keep the _production_ p95
   as `blocked_ext`. Sampler:
   `support/sidecars/S3-VERIFY-001/measure-alert-latency.sh`.
4. Re-run the forbidden-vocabulary scan at dev tip and either close the
   `forwarded` / `mirror` findings or record them as an explicit board-level gap.
5. Resolve the `S3-VERIFY-002..005` scope question through the board, not
   through sidecar prose.

Items 2 and 3 are now repo-local work, not external blockers. Only physical
device offline replay (#2 in the acceptance ledger) and the true production p95
remain honestly `blocked_ext`.
