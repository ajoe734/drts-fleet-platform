# CRC-BE-002 Sidecar Acceptance Packet

This document is the support-only acceptance packet for `CRC-BE-002` (`POST /partner/ingress/handoff — s2s token exchange minting short-lived passenger session`). It does not change canonical truth. It consolidates the machine-truth state, dependency map, repo baselines, and reviewer hotspots that `Claude2` should use when starting or reviewing the parent task.

Anchors used here come from:

- `AI_COLLABORATION_GUIDE.md`
- `ai-status.json` via `scripts/ai-status.sh show`
- `apps/api/src/modules/tenant-partner/partner-user-identity-link.repository.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/common/auth/jwt-auth.service.ts`
- `apps/api/src/common/auth/auth.matrix.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/referral-channel.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `apps/api/tests/unit/partner-user-identity-link.repository.test.ts`

## §1 Scope & Boundary

- **Task ID:** `CRC-BE-002-SIDECAR-ACCEPTANCE`
- **Parent Task:** `CRC-BE-002`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Parent Owner / Reviewer:** `Claude2` / `Codex`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/CRC-BE-002/CRC-BE-002-SIDECAR-ACCEPTANCE.md`

Guardrails for this packet:

- Do not change `CRC-BE-002` scope beyond what machine truth already states: partner ingress credential validation, `CRC-BE-001` identity binding reuse, short-lived passenger JWT issuance, and rejection of unauthorized callers.
- Do not treat this packet as implementation proof for `CRC-BE-002`; the parent task is still `todo`.
- Keep output limited to support material. No canonical spec, contract-truth, or runtime code is changed here.

## §2 Machine-Truth Anchors

### Parent Task: `CRC-BE-002`

| Field | Value |
| --- | --- |
| Title | `POST /partner/ingress/handoff — s2s token exchange minting short-lived passenger session` |
| Owner | `Claude2` |
| Reviewer | `Codex` |
| Status | `todo` |
| Depends on | `CRC-BE-001` |
| Artifacts | `apps/api/src/modules/tenant-partner/`, `apps/api/src/common/auth/` |
| Acceptance | `Valid ingress cred → short-lived passenger JWT carrying partnerEntrySlug; invalid cred rejected; reopen reuses binding; typecheck + test pass` |
| Last update | `2026-06-14T06:14:12Z` |

### Sidecar Task: `CRC-BE-002-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `in_progress` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/CRC-BE-002/CRC-BE-002-SIDECAR-ACCEPTANCE.md` |

## §3 Dependency Map

### Direct machine dependency: `CRC-BE-001` — partner user identity binding

| Field | Value |
| --- | --- |
| Status | `done` |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Commit | `95803b4dbde53e9de7dce33ff89af9605641722c` |
| Commit subject | `CRC-BE-001: add partner identity link store` |
| Integration status | `merged_to_dev` |
| Push | `origin/integrate/crc-be-001-20260614` |

`CRC-BE-001` is the concrete prerequisite for `CRC-BE-002`, not a vague upstream note:

- `apps/api/src/modules/tenant-partner/partner-user-identity-link.repository.ts` already provides `resolveOrCreate(...)`, `touchLastSeen(...)`, and `status(...)`.
- `packages/contracts/src/referral-channel.ts` already defines `PartnerUserIdentityLinkRecord` with `entrySlug`, `partnerUserRef`, `drtsPassengerId`, `status`, and consent metadata.
- `apps/api/tests/unit/partner-user-identity-link.repository.test.ts` already proves the key invariant the parent task depends on: same `(entrySlug, partnerUserRef)` resolves to the same `drtsPassengerId`, different refs do not collide, and `touchLastSeen(...)` preserves the resolved passenger.

### Practical runtime seams the parent task must compose with

| Seam | Current baseline | Why it matters to `CRC-BE-002` |
| --- | --- | --- |
| Partner ingress credential verification | `TenantPartnerService.authenticatePartnerBootstrap(...)` already validates `entrySlug + apiKey` and rejects missing / invalid / unconfigured credentials | `CRC-BE-002` should reuse the same credential authority instead of inventing a second ingress-secret path |
| Existing partner session issuance path | `POST /api/auth/partner/bootstrap-session` in `apps/api/src/modules/auth/auth.controller.ts` issues a 1h Bearer token after `authenticatePartnerBootstrap(...)` succeeds | The new handoff flow should align with the repo's existing JWT issuance seam rather than bypassing `JwtAuthService` |
| JWT signer | `apps/api/src/common/auth/jwt-auth.service.ts` signs payloads carrying `partnerEntrySlug` and existing auth identity fields | Parent work likely needs either a payload extension or a compatible way to carry passenger linkage without forking JWT rules |
| Auth matrix | `apps/api/src/common/auth/auth.matrix.ts` records the existing partner token issuance path as `/api/auth/partner/bootstrap-session` | Reviewer should check whether the new handoff route requires matrix/contract updates as part of the parent implementation |
| API contracts | `packages/contracts/src/index.ts` currently exposes `CreatePartnerBootstrapSessionCommand` / `PartnerBootstrapSession`, but no dedicated handoff command/response type is visible in the current baseline | Parent review should reject ad hoc controller-only payloads that bypass shared contracts |

## §4 Current Repo Baseline For The Parent Task

The current repo state shows `CRC-BE-002` has not landed yet, but the main ingredients already exist:

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` already exposes `authenticatePartnerBootstrap(...)`, which normalizes `entrySlug`, validates the provided API key against the active ingress credential for that entry, and returns an `IdentityContext` scoped to the partner entry.
- `apps/api/src/modules/auth/auth.controller.ts` already has an open route `POST("partner/bootstrap-session")` that signs a Bearer token through `JwtAuthService` with a one-hour expiry.
- `apps/api/src/common/auth/jwt-auth.service.ts` already supports signing identities that include `partnerEntrySlug`, but the current JWT payload shape does not show a dedicated `drtsPassengerId` field.
- `packages/contracts/src/index.ts` currently defines the partner bootstrap command as `{ entrySlug, apiKey }`, which means the handoff flow described in `CRC-BE-002` still needs a contract shape that can carry the partner-user reference and whatever response body the parent task standardizes.
- `packages/contracts/src/referral-channel.ts` already defines referral identity-link records, so the parent task can compose with an existing domain type instead of inventing a new passenger-binding record.

This packet should therefore be read as a start gate and review map for `CRC-BE-002`, not as evidence that the handoff endpoint already exists.

## §5 Parent-Task Acceptance Checklist (`CRC-BE-002`)

These reviewer-facing gates derive from machine truth and the current repo seams. They do not add new product semantics; they make the existing task statement operational.

### A. Scope gates

- [ ] Add the server-to-server handoff path for partner ingress callers without exposing ingress credentials to the frontend.
- [ ] Reuse the `CRC-BE-001` identity-binding repository so the same `(entrySlug, partnerUserRef)` reopens to the same `drtsPassengerId`.
- [ ] Validate ingress credentials through the existing partner-entry authority instead of introducing a parallel secret-validation path.
- [ ] Mint a short-lived passenger session token through the repo's existing JWT signing path.
- [ ] Ensure the resulting session carries partner-entry context at minimum and preserves the passenger-binding semantics required by the task brief.

### B. Contract and implementation gates

- [ ] Shared contracts are updated if the new route needs a request/response type beyond the existing `CreatePartnerBootstrapSessionCommand` and `PartnerBootstrapSession`.
- [ ] The implementation lands in the existing auth / tenant-partner seams (`apps/api/src/modules/auth/`, `apps/api/src/modules/tenant-partner/`, `apps/api/src/common/auth/`) instead of creating an orphan side channel.
- [ ] The handoff flow updates binding freshness (`touchLastSeen(...)`) or otherwise preserves the "reopen reuses binding" invariant captured by `CRC-BE-001`.
- [ ] Unauthorized, missing, or invalid ingress credentials are rejected with tests, not only by happy-path behavior.
- [ ] Reviewer can identify where the passenger identifier is carried or derivable in the issued session and confirm the design does not regress existing JWT verification paths.

### C. Verification gates

- [ ] Relevant API typecheck passes.
- [ ] Relevant API tests pass.
- [ ] Tests cover: valid ingress credential exchange, invalid credential rejection, binding reuse on reopen, and session issuance behavior.
- [ ] Parent review checks that the new route does not silently conflict with the existing `/api/auth/partner/bootstrap-session` path or duplicate its responsibility without a clear boundary.

### D. Guardrails

- [ ] This sidecar packet itself changes support material only.
- [ ] Parent implementation should not rewrite `CRC-BE-001` canonical behavior or weaken its identity-binding invariant.
- [ ] Parent review should reject any solution that hardcodes partner secrets into browser-facing paths or bypasses shared contracts for the new handoff payload.

## §6 Reviewer Hotspots

These are the highest-signal review points for `Claude2` on the parent task and for `Codex` later when `CRC-BE-002` enters review:

1. `CRC-BE-002` should compose with the existing partner ingress authentication seam. If the implementation re-validates secrets outside `TenantPartnerService`, it is likely diverging from the current authority model.
2. The current JWT payload shape visibly carries `partnerEntrySlug` but not an obvious passenger identifier. Review should explicitly confirm how the parent task expresses `drtsPassengerId` in the signed session, and whether shared contract or auth payload changes are required.
3. The existing partner auth route is `/api/auth/partner/bootstrap-session`. Review should verify the new handoff endpoint has a clear boundary relative to that route instead of becoming a duplicate flow with slightly different payloads.
4. `CRC-BE-001` is already merged to `dev`, so binding durability should not be reimplemented in `CRC-BE-002`. Parent work should call the repository seam and preserve the same-link / same-passenger invariant proven by the existing unit tests.
5. If the parent task updates auth contracts, the corresponding client/shared contract surface should move with it. Reviewer should reject controller-local DTO drift.

## §7 Packet Completeness Check

- [x] The packet is anchored to machine-truth task slices for both `CRC-BE-002` and `CRC-BE-002-SIDECAR-ACCEPTANCE`.
- [x] The direct dependency `CRC-BE-001` is named with its recorded completion commit `95803b4dbde53e9de7dce33ff89af9605641722c`.
- [x] The packet references the concrete binding repository and test anchors already present in the repo.
- [x] The packet records the current partner auth baseline: existing ingress credential validation, existing partner bootstrap session route, and the shared JWT signer.
- [x] The packet identifies the visible contract gap between the existing partner bootstrap command and the new handoff flow described by the parent task.
- [x] The only support artifact content for this task is this file under `support/sidecars/CRC-BE-002/`.

## §8 Reviewer Handoff Notes (for `Claude2`)

1. Reconfirm `CRC-BE-002` is still `todo`, owned by `Claude2`, reviewed by `Codex`, and dependent on `CRC-BE-001`. If machine truth changes, refresh this packet before approval.
2. Reconfirm `CRC-BE-001` remains the accepted binding store baseline on commit `95803b4dbde53e9de7dce33ff89af9605641722c`, because this packet assumes the parent task only composes with that work.
3. When starting the parent task, check whether the implementation should extend the existing auth controller route family or introduce a distinct route with shared contracts; do not leave that boundary implicit.
4. During parent review, verify exactly how the signed passenger session carries or resolves `drtsPassengerId`, because the current visible JWT payload shape only shows `partnerEntrySlug`.
5. Approval of this sidecar should verify that the only task-scoped content change is this packet plus machine-state transitions recorded via `scripts/ai-status.sh`.
