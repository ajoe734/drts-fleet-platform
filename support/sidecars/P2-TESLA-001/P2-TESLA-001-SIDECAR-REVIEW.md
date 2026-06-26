# P2-TESLA-001 Review Packet & Evidence Summary

**Sidecar Task:** `P2-TESLA-001-SIDECAR-REVIEW`  
**Parent Task:** `P2-TESLA-001`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex`  
**Assigned Sidecar Reviewer:** `Codex2`  
**Parent Reviewer of Record:** `Claude2`  
**Last Revised:** `2026-06-26` (UTC)  
**Status:** `READY FOR REVIEW HANDOFF`

---

## 1. Purpose

This file is a support-only reviewer packet for the Phase 2 Tesla public fleet integration task
`P2-TESLA-001`.

Its scope is intentionally narrow:

- capture the current machine-truth snapshot for the sidecar and parent task
- summarize the pushed parent review surface at `origin/codex2/p2-tesla-001`
- give the assigned sidecar reviewer `Codex2` a compact evidence packet without changing canonical truth

This packet does **not** approve or replace the parent reviewer-of-record `Claude2`.
The parent task remains in the normal canonical review flow.

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

`AI_NAME=Codex scripts/ai-status.sh show P2-TESLA-001-SIDECAR-REVIEW` reports:

- owner: `Codex`
- reviewer: `Codex2`
- status: `in_progress`
- acceptance:
  - create support artifacts only
  - do not edit canonical truth
  - hand off the packet to the assigned reviewer

### 2.2 Parent task

`AI_NAME=Codex scripts/ai-status.sh show P2-TESLA-001` reports:

- owner: `Codex2`
- reviewer: `Claude2`
- status: `review`
- artifact roots:
  - `apps/api/src/modules/tesla-integration/`
  - `packages/shared-test-fixtures/`
- recorded implementation summary:
  - OAuth connect / refresh / revoke
  - region handling
  - VIN discovery and Phase 1 vehicle bind
  - virtual-key pairing state
  - telemetry configure / status / public sample / projection
  - allowlisted non-driving command broker
  - command receipt persistence hook
  - audit logging
- recorded verification commands:
  - `pnpm --filter @drts/contracts build`
  - `pnpm --filter @drts/shared-test-fixtures build`
  - `pnpm --filter @drts/api exec vitest run --pool=threads --maxWorkers=1 tests/unit/tesla-integration.service.test.ts tests/integration/int-tesla-001-public-fleet-mock.test.ts`

### 2.3 Parent review branch

The pushed parent branch under review is:

- branch: `origin/codex2/p2-tesla-001`
- head commit: `ad05153b5289dd37a2b37bb2d28ed29ca48fd975`
- subject: `wip(P2-TESLA-001): anchor tesla public fleet integration`

Practical meaning:

- the parent implementation is available on a pushed review branch
- the parent task is not finalized or closed out
- this sidecar packet is support context only; it does not change the parent review owner, status, or canonical acceptance state

---

## 3. Parent Review Surface

`git diff --name-status origin/dev...origin/codex2/p2-tesla-001` shows eight changed files:

| File | Role in review |
| --- | --- |
| `apps/api/src/modules/tesla-integration/tesla-integration.controller.ts` | HTTP surface for Tesla integration endpoints |
| `apps/api/src/modules/tesla-integration/tesla-integration.module.ts` | wires controller, repository, DB, audit, regulatory registry |
| `apps/api/src/modules/tesla-integration/tesla-integration.repository.ts` | loads and persists `CommandReceipt` records |
| `apps/api/src/modules/tesla-integration/tesla-integration.service.ts` | main business logic for OAuth, VIN bind, virtual key, telemetry, commands |
| `apps/api/tests/integration/int-tesla-001-public-fleet-mock.test.ts` | end-to-end HTTP flow for public fleet mock |
| `apps/api/tests/unit/tesla-integration.service.test.ts` | service-level behavior and guardrail coverage |
| `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | DTO / enum / record additions for Tesla integration |
| `packages/shared-test-fixtures/src/index.ts` | Tesla discovery and public telemetry test fixtures |

`git diff --stat origin/dev...origin/codex2/p2-tesla-001` reports:

- `8 files changed`
- `1540 insertions`
- `16 deletions`

---

## 4. Evidence Highlights

### 4.1 Contract surface added in `packages/contracts`

The parent branch extends `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` with the Tesla
control-plane DTOs and enums the API layer uses:

- regions: `north_america`, `europe_middle_east_africa`, `asia_pacific`
- OAuth record and commands: begin, refresh, revoke
- discovery and binding records: discovered Tesla vehicle, Phase 1 bind record
- virtual key record and pairing command
- telemetry mode and status records
- command issue payload for the Tesla command bridge

This is consistent with the task brief's requirement to expose Tesla public fleet integration
surfaces without implying a controllable FSD runtime.

### 4.2 Controller endpoints exposed on the parent branch

`apps/api/src/modules/tesla-integration/tesla-integration.controller.ts` adds these endpoints:

- `GET /tesla-integration/regions`
- `POST /tesla-integration/oauth/session`
- `POST /tesla-integration/oauth/token/refresh`
- `POST /tesla-integration/oauth/token/revoke`
- `GET /tesla-integration/vehicles/discover`
- `GET /tesla-integration/vehicles/bindings`
- `POST /tesla-integration/vehicles/bind`
- `POST /tesla-integration/virtual-key/pairing`
- `GET /tesla-integration/virtual-key/pairing/:vehicleId`
- `POST /tesla-integration/telemetry/configure`
- `GET /tesla-integration/telemetry/:vehicleId/status`
- `GET /tesla-integration/telemetry/:vehicleId/public-sample`
- `GET /tesla-integration/telemetry/:vehicleId/projection`
- `POST /tesla-integration/commands`
- `GET /tesla-integration/commands/:commandId`

### 4.3 Service behaviors and guardrails

The service implementation on the parent branch establishes these review-relevant behaviors:

1. OAuth lifecycle:
   - begins an active OAuth connection with default scopes
   - refresh only works for active connections
   - revoke marks the connection as revoked and records audit
2. Vehicle discovery and bind:
   - discovery only returns seed vehicles for accounts with an active OAuth connection
   - VIN bind requires both a known Phase 1 vehicle ID and a discovered Tesla VIN
3. Virtual key pairing:
   - pairing requires an existing bind
   - status falls back to `unpaired` when no pair exists yet
4. Telemetry:
   - `sampleIntervalSec` must stay between `5` and `300`
   - `public_mock` generates a Tesla public telemetry sample and a projected vehicle snapshot
   - projected battery range is derived from battery level (`batteryLevelPct * 4.3`)
5. Command broker:
   - only allowlisted non-driving commands are accepted:
     - `wake_up`
     - `honk_horn`
     - `flash_lights`
     - `door_lock`
     - `door_unlock`
     - `set_charge_limit`
     - `charge_start`
     - `charge_stop`
   - non-allowlisted commands fail with `TESLA_COMMAND_NOT_ALLOWLISTED`
   - the contract still defines higher-risk command types like `remote_start` and `minimal_risk_stop`, but the service explicitly rejects them in this broker path
6. Receipt persistence and audit:
   - receipts are keyed by `commandId` and `idempotencyKey`
   - repository persistence targets `av_sandbox.command_receipts`
   - persistence failure falls back to memory with a warning
   - audit events are recorded for OAuth, bind, virtual-key pairing, telemetry configure, and command issue actions

### 4.4 Test coverage visible on the parent branch

`apps/api/tests/unit/tesla-integration.service.test.ts` covers:

- OAuth start plus VIN discovery
- Phase 1 vehicle bind
- telemetry configuration and projected vehicle snapshot
- allowlisted command persistence
- audit logging for issued commands
- rejection of non-allowlisted command types

`apps/api/tests/integration/int-tesla-001-public-fleet-mock.test.ts` covers the HTTP flow:

- create OAuth session
- bind a Tesla VIN to `veh-demo-001`
- configure public mock telemetry
- fetch projected telemetry
- confirm `remote_start` is rejected with `TESLA_COMMAND_NOT_ALLOWLISTED`

`packages/shared-test-fixtures/src/index.ts` adds helper fixtures for:

- discovered Tesla vehicles
- Tesla public telemetry samples
- Phase 2 source metadata scaffolding

### 4.5 Evidence posture

This sidecar packet did **not** independently re-run the parent branch test commands from a separate
worktree.

Current evidence is therefore:

- pushed parent review branch at `origin/codex2/p2-tesla-001`
- machine-truth verification note already recorded on parent task `P2-TESLA-001`
- directly inspected parent diff, service/controller/repository code, and the parent test files

---

## 5. Reviewer Focus

The assigned sidecar reviewer `Codex2` should check these points before approving this packet:

1. The packet stays in support scope and does not pretend to close or approve the parent task.
2. The parent task is described as `review` with reviewer `Claude2`, not as `done`.
3. The packet accurately reflects the pushed parent branch `origin/codex2/p2-tesla-001` at `ad05153b5`.
4. The command broker summary preserves the key safety boundary: non-driving allowlist only, no implication of controllable FSD or live-driving command authority.
5. The recorded verification commands and test summaries match the parent task's machine truth.

If the packet is accurate, the sidecar reviewer can approve the sidecar artifact while the parent
task continues through its own canonical review path.

---

## 6. Suggested Review Commands

Owner handoff to `Codex2`:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-TESLA-001-SIDECAR-REVIEW Codex2 "P2-TESLA-001 sidecar review packet is ready at support/sidecars/P2-TESLA-001/P2-TESLA-001-SIDECAR-REVIEW.md. The packet captures current machine truth: sidecar task owner=Codex reviewer=Codex2 status=in_progress, while parent P2-TESLA-001 remains in review with owner=Codex2 reviewer=Claude2. It summarizes the pushed parent review branch origin/codex2/p2-tesla-001 at ad05153b5, the 8-file Tesla integration review surface, the non-driving command allowlist guardrail, and the recorded verification commands without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-TESLA-001-SIDECAR-REVIEW "審查通過：P2-TESLA-001 sidecar review packet 已正確整理 parent task 仍在 review（owner=Codex2, reviewer=Claude2）時的 machine-truth snapshot、推送中的 review branch origin/codex2/p2-tesla-001@ad05153b5、Tesla integration API surface、non-driving command allowlist guardrail，以及 parent task 已記錄的驗證命令；support artifact only，未改 canonical truth。"
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-TESLA-001-SIDECAR-REVIEW "packet needs revision: [specify machine-truth mismatch / branch evidence mismatch / support-scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 INTEGRATION_STATUS=not_applicable scripts/ai-status.sh done P2-TESLA-001-SIDECAR-REVIEW "Done: P2-TESLA-001 sidecar review packet summarized the pushed parent review branch ad05153b5, the Tesla integration review surface, and the recorded verification evidence without changing canonical truth."
```

---

## 7. Change Log

- `2026-06-26`: created the initial sidecar reviewer packet for `P2-TESLA-001`
- `2026-06-26`: captured parent status `review` plus pushed branch evidence at `origin/codex2/p2-tesla-001`
- `2026-06-26`: summarized controller endpoints, service guardrails, persistence behavior, and parent test coverage for reviewer handoff
