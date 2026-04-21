# GAP-P2S1-006 Review Packet & Evidence Summary

**Sidecar Task:** `GAP-P2S1-006-SIDECAR-REVIEW`  
**Parent Task:** `GAP-P2S1-006`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `ACTIVE SUPPORT ARTIFACT — parent GAP-P2S1-006 is already review_approved and waiting owner done closeout; this sidecar remains in review and awaits reviewer Codex decision`

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: review packet, evidence summary, reviewer hotspots, routing trail, and closeout commands.
- Out of scope: changing API runtime behavior, editing deploy logic, modifying canonical truth, or redefining the parent acceptance bar.

The only shared truth used here is:

- `ai-status.json`
- `current-work.md`
- `ai-activity-log.jsonl`
- `docs-site/index.html`

Implementation files are cited only as reviewer evidence surfaces.

---

## 2. Shared-Truth Snapshot

Using only the required shared files, the current machine-truth baseline is:

- Parent task `GAP-P2S1-006` is `review_approved`.
- Parent owner / reviewer are `Codex2` / `Codex`.
- Parent `next` in shared truth says:
  - `internal-key middleware` now only bypasses for non-system bootstrap identities with `actorType + actorId`
  - `x-realm` alone is no longer trusted
  - `auth-bootstrap` unit tests and `@drts/api` typecheck both passed
  - owner `Codex2` must still move the parent from `review_approved` to `done`
- Current unresolved handoff queue entries are:
  - `2026-04-17T11:20:51Z` `GAP-P2S1-006`: `Codex -> Codex2`
  - `2026-04-17T11:21:05Z` `GAP-P2S1-006-SIDECAR-REVIEW`: `Qwen -> Codex`
- This sidecar task `GAP-P2S1-006-SIDECAR-REVIEW` is currently:
  - owner: `Codex2`
  - reviewer: `Codex`
  - status: `review`
- `ai-activity-log.jsonl` records the reviewer-relevant sequence:
  - `2026-04-17T11:14:56Z` `Codex` reopened parent `GAP-P2S1-006`
  - `2026-04-17T11:16:52Z` `Codex2` handed the parent back with the remediation summary
  - `2026-04-17T11:19:29Z` `Codex2` handed this refreshed sidecar packet to `Codex`
  - `2026-04-17T11:20:51Z` `Codex` recorded `review_approved` on the parent task
  - `2026-04-17T11:21:11Z` Orchestrator re-started the current `Codex` reviewer worker for this sidecar after repeated `Qwen` auth failures
- `docs-site/index.html` is only the dashboard shell and contributes no conflicting product or runtime truth.

Practical meaning:

- the parent implementation lane is no longer waiting on reviewer findings from `Codex`
- the parent owner still owes the formal `done` closeout
- this sidecar is now just the support packet review step tied to that already-approved parent state
- the packet must preserve both the substantive owner handoff (`2026-04-17T11:19:29Z`) and the final machine-truth reassignment noise (`Qwen -> Codex`)

---

## 3. Parent Review Summary

The closed reviewer position on the parent task is:

- staging protection no longer trusts `x-realm` by itself
- middleware bypass now requires a validated non-system bootstrap identity
- that identity must include non-empty `actorType` and `actorId`
- `GET /api/identity/context` remains the explicit public route exception
- uncovered routes such as `/api/admin/flags` and `/api/driver-settings/*` fail closed without either:
  - a validated bootstrap identity, or
  - a matching `x-drts-internal-key`
- staging deploy wiring injects `DRTS_INTERNAL_KEY` into the API Cloud Run service

Those claims are the only parent findings this packet needs to summarize. This sidecar does not reopen them.

---

## 4. Evidence Surface

| ID  | Evidence                                                                                                                 | Anchor                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| E-1 | Parent machine-truth approval and owner finalize handoff                                                                 | `ai-status.json`, `current-work.md`                   |
| E-2 | Sidecar routing trail, reopen, remediation handoff, and reviewer dispatch churn                                          | `ai-activity-log.jsonl`                               |
| E-3 | Internal-key bypass gate after the reopen fix                                                                            | `apps/api/src/common/auth/internal-key.middleware.ts` |
| E-4 | Regression coverage for x-realm-only failure, admin fail-closed, driver-settings fail-closed, and valid bootstrap bypass | `apps/api/tests/unit/auth-bootstrap.test.ts`          |
| E-5 | Staging secret injection for runtime enforcement                                                                         | `.github/workflows/deploy-staging.yml`                |

### 4.1 Middleware Anchor

`apps/api/src/common/auth/internal-key.middleware.ts` now:

- bypasses health checks and `OPTIONS`
- bypasses the explicit public route `GET /api/identity/context`
- calls `extractBootstrapRequestIdentity(..., { allowAnonymous: false, ... })`
- only bypasses when that helper returns a non-system identity with:
  - realm in `platform | tenant | ops | driver`
  - non-empty `actorType`
  - non-empty `actorId`
- otherwise requires `x-drts-internal-key` and validates it via `timingSafeEqual`

### 4.2 Regression Anchor

`apps/api/tests/unit/auth-bootstrap.test.ts` explicitly covers:

- valid tenant bootstrap bypass on `POST /api/tenant/webhooks`
- rejection of `x-realm`-only requests on that same protected route
- explicit public bypass for `GET /api/identity/context`
- fail-closed behavior for `/api/admin/flags`
- fail-closed behavior for `/api/driver-settings/drv-001`
- allowed bootstrap bypass for the driver-settings route when a real `driver` identity is present
- missing / invalid internal-key rejection on system-scoped protected routes
- acceptance of a matching internal key
- `InternalKeyMiddleware.use()` invoking `next()` after successful validation

### 4.3 Staging Deploy Anchor

`.github/workflows/deploy-staging.yml` injects:

- `DRTS_INTERNAL_KEY=drts-staging-internal-key:latest`

into the API Cloud Run deployment secret set, so the middleware guard is not review-only dead code.

---

## 5. Reviewer Hotspots

Reviewer `Codex` should confirm:

1. This packet stays support-only and does not modify canonical truth or the parent implementation.
2. It correctly reflects that parent `GAP-P2S1-006` is already `review_approved`, not still `review`.
3. It preserves the parent owner-closeout dependency by calling out the `Codex -> Codex2` finalize handoff at `2026-04-17T11:20:51Z`.
4. It correctly distinguishes the meaningful sidecar owner handoff at `2026-04-17T11:19:29Z` from the final unresolved queue entry `Qwen -> Codex` at `2026-04-17T11:21:05Z`.
5. The middleware summary matches the actual post-reopen gate: no `x-realm`-only bypass, validated bootstrap identity required, explicit public route limited to `GET /api/identity/context`.
6. The regression summary matches the actual test anchors for tenant webhooks, admin flags, and driver-settings.
7. The staging workflow still injects `DRTS_INTERNAL_KEY` into the API deployment path.

Suggested approval wording:

> `審查通過：GAP-P2S1-006 sidecar review packet 已對齊最新 shared truth（parent GAP-P2S1-006=review_approved、owner finalize handoff=2026-04-17T11:20:51Z、sidecar reviewer queue 最後落在 11:21:05Z 的 Qwen -> Codex 改派），並正確彙整 validated bootstrap identity bypass、x-realm-only fail-closed 回歸測試、/api/admin/flags 與 /api/driver-settings/* 錨點，以及 staging DRTS_INTERNAL_KEY 注入。support artifact only。回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / stale routing trail / wrong parent status / support-scope violation]`

---

## 6. Handoff / Review / Closeout Commands

Owner handoff reference:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-006-SIDECAR-REVIEW Codex "GAP-P2S1-006 sidecar review packet is ready at support/sidecars/GAP-P2S1-006/GAP-P2S1-006-SIDECAR-REVIEW.md. It matches current shared truth: parent GAP-P2S1-006 is already review_approved after the reopen fix, owner closeout is pending, and this support-only packet summarizes the validated-bootstrap-identity bypass rule, the x-realm-only fail-closed regression anchors, the staging DRTS_INTERNAL_KEY injection, and the sidecar routing trail without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex \
REVIEW_FILE=support/sidecars/GAP-P2S1-006/GAP-P2S1-006-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：GAP-P2S1-006 sidecar review packet 已對齊最新 shared truth（parent GAP-P2S1-006=review_approved、owner finalize handoff=2026-04-17T11:20:51Z、sidecar reviewer queue 最後落在 11:21:05Z 的 Qwen -> Codex 改派），並正確彙整 validated bootstrap identity bypass、x-realm-only fail-closed 回歸測試、/api/admin/flags 與 /api/driver-settings/* 錨點，以及 staging DRTS_INTERNAL_KEY 注入。support artifact only。|回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
python3 scripts/ai_status.py approve GAP-P2S1-006-SIDECAR-REVIEW \
  "Review approved. The sidecar packet matches the current parent review_approved state, the owner-finalize handoff, the validated-bootstrap-identity evidence chain, and the sidecar reassignment trail without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-006-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / stale routing trail / wrong parent status / support-scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done GAP-P2S1-006-SIDECAR-REVIEW \
  "Done: GAP-P2S1-006 sidecar review packet recorded the parent review_approved evidence state, the owner-finalize dependency, the validated bootstrap identity and regression anchors, and the support-only reviewer workflow without changing canonical truth."
```

---

## 7. Change Log

- 2026-04-17 - Packet refreshed after the parent reopen so the support artifact described the x-realm-only bypass bug, the remediation handoff, and the reviewer evidence surfaces.
- 2026-04-17 - Packet refreshed again to match the latest shared truth where parent `GAP-P2S1-006` is already `review_approved`, owner closeout is pending, and this sidecar has returned to reviewer `Codex` after repeated `Qwen` auth failures.

---

_This document is a support artifact only. It does not alter `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`, L1 canonical truth, or the parent GAP-P2S1-006 runtime implementation._
