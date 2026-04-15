# Review Packet: WE-002 Docker Multi-Stage Build

**Sidecar Task:** `WE-002-SIDECAR-REVIEW`
**Parent Task:** `WE-002`
**Helper Kind:** `review_packet`
**Prepared by:** Claude
**Refreshed by:** Codex
**Reviewer:** Codex
**Date:** 2026-04-15
**Status:** `REVIEW_APPROVED` pending owner closeout

---

## 1. Summary

This sidecar packet has been refreshed to match the 2026-04-15 machine truth.

- Parent task `WE-002` is already `done` in `ai-status.json`.
- Final recorded commit is `657a4d3` (`fix(we-002): apply reviewer fixes — COPY patterns, /api/health, lockfile`).
- Recorded reviewer notes state that all four Docker images built successfully, runtime checks passed, and `/health` plus `/api/health` both returned `200`.
- This supersedes the older 2026-04-14 packet, which still referenced reviewer `Qwen`, parent status `review`, and pre-fix commit `9f197f4`.

This document remains a support artifact only. It does not modify canonical truth or main runtime behavior.

---

## 2. Canonical State Snapshot

### 2.1 Parent Task (`WE-002`)

| Field       | Current machine truth                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status      | `done`                                                                                                                                                                                     |
| Owner       | `Claude`                                                                                                                                                                                   |
| Reviewer    | `Codex`                                                                                                                                                                                    |
| Last update | `2026-04-15T00:27:06Z`                                                                                                                                                                     |
| Commit      | `657a4d3`                                                                                                                                                                                  |
| Next        | Reviewer fixes committed: COPY patterns corrected in all 4 Dockerfiles, `/api/health` alias registered, `pnpm-lock.yaml` normalised, `.dockerignore` extended. AC-P1/AC-P2/AC-P3 all PASS. |

### 2.2 Sidecar Task (`WE-002-SIDECAR-REVIEW`)

| Field                     | Current machine truth                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Status before this review | `review`                                                                    |
| Owner                     | `Claude`                                                                    |
| Reviewer                  | `Codex`                                                                     |
| Last update               | `2026-04-15T00:11:25Z`                                                      |
| Next                      | Auto-reassigned review from Qwen to Codex after repeated Qwen terminal exit |

### 2.3 Recorded reviewer outcome for parent task

`current-work.md` and `ai-status.json` record the following accepted facts for `WE-002`:

- Four Docker images built successfully with tags `drts-review-api`, `platform-admin-web`, `ops-console-web`, and `tenant-portal-web`, all suffixed `:we002`.
- Approximate image sizes were recorded as `257MB`, `280MB`, `280MB`, and `282MB`.
- Runtime verification passed:
  - `platform-admin`, `ops-console`, and `tenant-portal` root paths returned `200`.
  - API container was healthy.
  - Both `/health` and `/api/health` returned `200`.
- Original implementation commit `9f197f4` was not acceptable as final closeout because of lockfile drift, tenant `/bookings/new` build failure, and missing health alias. Final approval was based on the corrected working tree and closeout commit `657a4d3`.

---

## 3. Artifacts Under Review

| Artifact                                   | Purpose                            | Final evidence                                     |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------- |
| `apps/api/Dockerfile`                      | API four-stage Docker build        | Finalized in `657a4d3`; runtime probe on `/health` |
| `apps/platform-admin-web/Dockerfile`       | Platform Admin standalone image    | COPY pattern corrected in `657a4d3`                |
| `apps/tenant-portal-web/Dockerfile`        | Tenant Portal standalone image     | COPY pattern corrected in `657a4d3`                |
| `apps/ops-console-web/Dockerfile`          | Ops Console standalone image       | COPY pattern corrected in `657a4d3`                |
| `apps/api/src/main.ts`                     | Registers `/api/health` alias      | Added in `657a4d3`                                 |
| `apps/api/src/health/health.controller.ts` | Shared health payload              | Refactored in `657a4d3`                            |
| `.dockerignore`                            | Build-context exclusions           | Extended in `657a4d3`                              |
| `docker-compose.prod.yml`                  | Local multi-service runtime wiring | Confirms ports and service layout                  |
| `apps/*/next.config.ts`                    | Standalone output + tracing root   | Confirms monorepo-compatible Next runtime          |

---

## 4. Acceptance Criteria Evaluation

| #   | Criterion (from `ai-status.json`)    | Status   | Evidence                                                                                                                                                                              |
| --- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docker build 各 image 成功`         | **PASS** | Parent task review notes record successful builds for all four images; Dockerfiles are multi-stage and aligned to final commit `657a4d3`                                              |
| 2   | `api image 可啟動並回應 /api/health` | **PASS** | `apps/api/src/main.ts` now registers `/api/health`; `health.controller.ts` provides shared payload; recorded runtime review notes say `/health` and `/api/health` both returned `200` |
| 3   | `web image 可啟動`                   | **PASS** | All three web apps use `output: "standalone"` and runtime `server.js`; recorded runtime review notes say all three web roots returned `200`                                           |

---

## 5. Technical Review Notes

### 5.1 What changed in the final accepted commit

`657a4d3` is the decisive review-fix commit, not just a cosmetic follow-up.

- Corrected COPY patterns in all four Dockerfiles so build stages copy complete app directories instead of brittle partial patterns.
- Registered `/api/health` in `apps/api/src/main.ts`, closing the acceptance gap between Docker's internal `/health` probe and the task wording that requires `/api/health`.
- Refactored `apps/api/src/health/health.controller.ts` so `/health` and `/api/health` share the same payload source.
- Normalised `pnpm-lock.yaml`, which the earlier `9f197f4` closeout did not satisfy.
- Extended `.dockerignore` to reduce build context noise.

### 5.2 Closed concerns from the stale 2026-04-14 packet

The older sidecar packet had several review concerns. Current machine truth resolves the important ones:

| Older concern                                      | Current disposition                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewer was still `Qwen`                          | Resolved: sidecar reviewer is now `Codex`                                                                                            |
| Parent task still in `review`                      | Resolved: parent task is `done`                                                                                                      |
| `/health` vs `/api/health` was only a hypothesis   | Resolved: `/api/health` alias exists in `apps/api/src/main.ts` and recorded runtime verification shows both endpoints returned `200` |
| Original commit `9f197f4` treated as main evidence | Resolved: final accepted commit is `657a4d3`; machine truth explicitly says `9f197f4` must not be reused for closeout                |

### 5.3 Remaining non-blocking follow-ups

These do not block `WE-002` or this sidecar review packet, but they remain worth tracking:

| Item                                                         | Severity | Notes                                                                               |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `docker-compose.prod.yml` uses `depends_on` start order only | Low      | No `service_healthy` gating yet; suitable follow-up for staging/smoke work          |
| API Dockerfile does not install `libc6-compat`               | Low      | Web Dockerfiles do; current machine truth contains no failure evidence tied to this |
| Secrets / env injection are minimal in compose file          | Low      | Out of WE-002 scope; belongs to staging/deploy slices                               |
| `driver-app` has no Dockerfile                               | Info     | Expected; not part of parent acceptance criteria                                    |

---

## 6. Review Recommendation

**Overall verdict: PASS**

This sidecar review packet is now aligned to the final accepted state of `WE-002`.

- It stays within sidecar scope.
- It no longer cites stale reviewer ownership or stale parent status.
- It reflects the accepted closeout commit `657a4d3`.
- It incorporates the recorded runtime verification already captured in machine truth.

No further canonical changes are required for this sidecar. The task is ready to move from `review` to `review_approved`, then back to owner `Claude` for `done` closeout with `NO_COMMIT_REQUIRED=1`.

---

## 7. Reviewer and Owner Commands

**Reviewer approval (Codex)**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve WE-002-SIDECAR-REVIEW \
  "Review packet refreshed to 2026-04-15 machine truth; parent WE-002 done at 657a4d3; AC-P1~P3 evidence and runtime verification aligned"
```

**Owner closeout (Claude)**

```bash
AI_NAME=Claude NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done WE-002-SIDECAR-REVIEW \
  "Owner finalized approved sidecar; review packet aligned to WE-002 final state at support/sidecars/WE-002/WE-002-SIDECAR-REVIEW.md"
```

---

## 8. Change Log

- 2026-04-14: Claude created the original review packet.
- 2026-04-15: Codex refreshed the packet to current machine truth, replacing stale Qwen-era review metadata with the final `WE-002` evidence trail (`657a4d3`, `/api/health` alias, recorded runtime pass notes).

---

_This document is a sidecar support artifact. It does not alter `ai-status.json`, canonical product truth, or the `WE-002` canonical review lifecycle._
