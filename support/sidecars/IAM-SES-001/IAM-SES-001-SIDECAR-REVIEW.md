# IAM-SES-001-SIDECAR-REVIEW

**Support-only review packet for `IAM-SES-001`**

- Sidecar task: `IAM-SES-001-SIDECAR-REVIEW`
- Sidecar owner / reviewer: `Codex` / `Codex2`
- Parent task: `IAM-SES-001` - durable sessions, refresh families, and token records
- Parent owner / reviewer: `Codex2` / `Codex`
- Parent dependency: `IAM-ACC-001` (`done` on `origin/dev` at `c1f02ae570e6c6ba19e460af75ddf7d71443dc20`)
- Artifact scope: `support/sidecars/IAM-SES-001/IAM-SES-001-SIDECAR-REVIEW.md` only
- Guardrail: support artifact only; do not mutate canonical truth, runtime code, contracts, tests, or parent review state

## 1. Scope Boundary

In scope:

- freeze the current machine-truth state for parent `IAM-SES-001` after the failed review reopening
- summarize the active evidence chain, reopened findings, and changed-file surface on `origin/codex2/iam-ses-001`
- give reviewer-facing hotspots for both the parent failure context and this sidecar refresh

Out of scope:

- editing `infra/migrations/`, `packages/contracts/src/`, `apps/api/src/modules/auth/`, or any parent implementation file
- reinterpreting or softening the recorded `Codex` review findings on `ae901573ee78ba751247923fa5d97441311424e8`
- claiming the parent task is back in `review`, `review_approved`, or `done` when machine truth now says `in_progress`

## 2. Machine-Truth Anchors

### Sidecar task

Stable fields in machine truth:

- owner=`Codex`
- reviewer=`Codex2`
- helper_parent=`IAM-SES-001`
- helper_kind=`review_packet`
- depends_on=`IAM-ACC-001`
- mutates_canonical=`false`
- artifact=`support/sidecars/IAM-SES-001/IAM-SES-001-SIDECAR-REVIEW.md`

Use `scripts/ai-status.sh show IAM-SES-001-SIDECAR-REVIEW` for live `status` / `last_update`; this packet avoids copying volatile sidecar lifecycle fields.

### Parent task

`AI_NAME=Codex scripts/ai-status.sh show IAM-SES-001` currently records:

- status=`in_progress`
- owner / reviewer=`Codex2` / `Codex`
- depends_on=`IAM-ACC-001`
- acceptance:
  - raw refresh and session secrets are never stored
  - concurrent refresh has one winner
  - revoked state survives process restart
  - expiry and family revocation are enforced
  - migration repository and Postgres integration tests pass
- latest `next` summary:
  - investigating failed review findings around refresh family FK ordering and absolute expiry enforcement

Dependency baseline:

- `IAM-ACC-001` is `done`
- commit=`c1f02ae570e6c6ba19e460af75ddf7d71443dc20`
- subject=`IAM-ACC-001: persist canonical identity authority (#1231)`
- push target=`origin/dev`

Latest authoritative parent evidence chain:

1. `2026-08-01T16:17:39Z` - `Codex2` handed the parent back with regression-fix commit `ae901573ee78ba751247923fa5d97441311424e8` and two passing unit suites.
2. `2026-08-01T16:53:38Z` - the chair reassigned the parent reviewer from `Gemini2` to `Codex`.
3. `2026-08-01T16:58:46Z` - `Codex` reopened the parent review with two concrete failures on `ae901573ee78ba751247923fa5d97441311424e8`.
4. `2026-08-01T16:59:09Z` - `Codex2` recorded owner progress investigating those failed review findings.

Implication:

- the latest active parent evidence is the `2026-08-01T16:58:46Z` failed review, not the earlier `2026-08-01T16:17:39Z` handoff
- parent `IAM-SES-001` is currently back on the owner in `in_progress`
- reviewer assignment still matters for the eventual next pass, but the task is not waiting on a reviewer approval right now

## 3. Parent Review Timeline

Reconstructed from `ai-activity-log.jsonl` plus the current parent task snapshot:

1. `2026-08-01T16:11:49Z` - `Codex2` handed `IAM-SES-001` to `Gemini2` with the initial durable-session implementation. Handoff text named:
   - `V0069__durable_session_refresh_families.sql`
   - auth repository / service / guard / controller integration
   - canonical session contract exports
   - unit coverage
   - `pnpm --filter @drts/contracts build`
   - `pnpm vitest run tests/unit/driver-device-session.test.ts tests/unit/identity-canonical-repository.test.ts`
   - isolated temporary-DB migration smoke proving `iam.sessions`, `iam.refresh_families`, `iam.refresh_tokens`, and key indexes
2. `2026-08-01T16:12:35Z` - `Gemini2` marked the parent `review_approved`.
3. `2026-08-01T16:13:22Z` - `Codex2` recorded closeout validation in progress.
4. `2026-08-01T16:17:39Z` - `Codex2` found post-review regressions during closeout validation, fixed them, pushed `ae901573ee78ba751247923fa5d97441311424e8` to `origin/codex2/iam-ses-001`, reran:
   - `pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts`
   - `pnpm exec vitest run tests/unit/driver-device-session.test.ts`
5. `2026-08-01T16:53:38Z` - the chair reassigned the parent reviewer from `Gemini2` to `Codex` to avoid a review deadlock while preserving owner / reviewer separation from `Codex2`.
6. `2026-08-01T16:58:46Z` - `Codex` failed the reopened review on `ae901573ee78ba751247923fa5d97441311424e8` with:
   - a DB-backed foreign-key ordering defect in the issue path
   - an absolute-expiry enforcement defect where family / session expiry slides on rotation
7. `2026-08-01T16:59:09Z` - `Codex2` moved the parent back to active owner investigation with `status=in_progress`.

Current reading:

- the `2026-08-01T16:12:35Z` approval is historical context only
- the `2026-08-01T16:17:39Z` handoff remains the latest implementation verification bundle
- the `2026-08-01T16:58:46Z` reopen is the latest binding parent truth

## 4. Change Surface On The Parent Branch

`git diff --name-only origin/dev...ae901573ee78ba751247923fa5d97441311424e8` shows nine task-owned files:

- `infra/migrations/V0069__durable_session_refresh_families.sql`
- `packages/contracts/src/index.ts`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/driver-device-session.repository.ts`
- `apps/api/src/modules/auth/driver-device-session.service.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `tests/unit/driver-device-session.test.ts`

Two parent commits currently define the review surface:

- `f1971129` - `feat(IAM-SES-001): persist driver refresh families`
- `ae901573ee78ba751247923fa5d97441311424e8` - `fix(IAM-SES-001): close out session auth regressions`

High-signal change summary:

- `V0069` creates durable `iam.sessions`, `iam.refresh_families`, and `iam.refresh_tokens` tables with `token_hash` storage only and foreign keys from `iam.refresh_families.current_token_id` / `previous_token_id` into `iam.refresh_tokens`.
- `packages/contracts/src/index.ts` exports canonical session, refresh-family, and refresh-token record types for shared schema use.
- `driver-device-session.repository.ts` introduces issue / rotate / revoke / load / active-check persistence with transactional DB logic and a non-DB fallback map.
- `driver-device-session.service.ts` moves register / refresh / revoke / access checks onto the repository-backed path, including revocation on device rebind.
- `bootstrap-auth.guard.ts`, `auth.controller.ts`, and `auth.module.ts` switch the auth flow to async where repository-backed binding validation is now awaited and wired through `DatabaseModule`.
- `auth-bootstrap.test.ts` updates guard assertions to async expectations and covers revoked driver-device bearer handling.
- `driver-device-session.test.ts` adds direct coverage for hash-only storage, single-winner rotation, revoked-binding persistence, and migration shape.

Current failed-review focus inside that surface:

- `driver-device-session.repository.ts` issue path builds a family with `currentTokenId` already set, inserts the family, then inserts the token, while `V0069` enforces the FK immediately.
- `driver-device-session.service.ts` and `driver-device-session.repository.ts` propagate a fresh `expiresAt` on registration and every rotation, which collapses absolute expiry into a sliding TTL.

## 5. Active Review Findings

### Finding A - DB-backed issue path violates the new refresh-family FK

Recorded in machine truth on `2026-08-01T16:58:46Z`.

Evidence:

- `apps/api/src/modules/auth/driver-device-session.repository.ts:95-146` on `ae901573ee78ba751247923fa5d97441311424e8` builds the family with `currentTokenId=refreshTokenId`, inserts the family first, then inserts the refresh-token row and performs a follow-up `UPDATE`.
- `infra/migrations/V0069__durable_session_refresh_families.sql:64-76` adds the `fk_refresh_family_current_token` and `fk_refresh_family_previous_token` constraints from `iam.refresh_families` into `iam.refresh_tokens`.

Impact:

- whenever the DB-backed path is enabled, first session issuance can fail before the referenced refresh-token row exists
- this blocks confidence in AC-2 and AC-5 even though the fallback and unit-only path still pass

### Finding B - absolute expiry is being reset as a sliding TTL

Recorded in machine truth on `2026-08-01T16:58:46Z`.

Evidence:

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md:340-345` requires sessions to track and enforce both `absolute expiry` and `idle expiry`.
- `apps/api/src/modules/auth/driver-device-session.service.ts:103-105` sets register-time `expiresAt=now+30d`.
- `apps/api/src/modules/auth/driver-device-session.service.ts:141-149` sets refresh-time `expiresAt=rotatedAt+30d`.
- `apps/api/src/modules/auth/driver-device-session.repository.ts:253-280` writes that new `expiresAt` onto both the session and family during rotation.

Impact:

- the current implementation extends family / session lifetime on every rotation instead of preserving a separate absolute-expiry ceiling
- AC-4 is not currently satisfied on the reviewed commit

These are active failed-review findings, not speculative follow-ups. The sidecar should present them as unresolved until the parent owner lands a fix and re-handoffs.

## 6. Acceptance Impact Snapshot

- AC-1 `Raw refresh and session secrets are never stored`
  Evidence remains strong: schema stores `token_hash`, repository hashes refresh secrets before persistence, and `tests/unit/driver-device-session.test.ts` covers hash-only storage behavior.
- AC-2 `Concurrent refresh has one winner`
  Rotation logic still aims for a single winner, but the DB-backed first-issuance path is currently unsafe because the family row can violate its token FK before rotation ever begins.
- AC-3 `Revoked state survives process restart`
  Durable tables and revoke / load paths exist, but this should remain unaccepted until the DB-backed issuance path works under the new constraints and is revalidated with a live database.
- AC-4 `Expiry and family revocation are enforced`
  Currently failed on the reviewed commit because the implementation slides family / session expiry on rotation instead of preserving absolute and idle expiry separately.
- AC-5 `Migration repository and Postgres integration tests pass`
  Still open. The latest verification only reran two unit suites, and the reopened FK finding specifically targets the DB-backed repository path that was not rerun against `DATABASE_URL` here.

## 7. Reviewer Hotspots

For parent-task context, the most important things to keep explicit are:

1. Do not describe the parent as still being in `review`. Its current machine-truth status is `in_progress`.
2. Distinguish between the latest implementation handoff (`2026-08-01T16:17:39Z`) and the latest active parent evidence (`2026-08-01T16:58:46Z` failed review).
3. Keep the reviewer reassignment explicit: `Codex` is still the assigned reviewer for the eventual next pass, but the owner turn is currently back with `Codex2`.
4. Keep the FK-ordering defect concrete: family insert happens before token insert while the migration adds an immediate FK.
5. Keep the expiry defect concrete: the implementation refreshes `expiresAt` on every rotation even though the architecture requires separate absolute and idle expiry.
6. Keep the DB test caveat explicit: the latest workspace evidence still lacks a rerun of the DB-backed integration path with `DATABASE_URL`.
7. Treat `IAM-ACC-001` as a fixed upstream baseline already merged to `dev`; this sidecar is not reopening principal / membership durability.

For sidecar-task review (`Codex2` reviewing this packet), verify only that this document matches current machine truth and keeps the support-only scope above.

## 8. Sidecar Scope Compliance

- [x] only this support artifact is updated for `IAM-SES-001-SIDECAR-REVIEW`
- [x] no parent implementation, canonical truth, or machine-truth files were edited by hand
- [x] parent evidence is summarized from task status, activity log entries, git history, and cited parent files only
- [x] packet distinguishes the latest implementation handoff from the latest failed-review finding
- [x] packet does not reinterpret the active findings as resolved
- [x] packet leaves parent fix / approval authority with `Codex2` and the next parent reviewer turn with `Codex`

## 9. Owner Verification

Verification performed while refreshing this packet:

- `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-001`
- `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-001`
- `rg -n "IAM-SES-001" /home/lupin/drts-fleet-platform/ai-activity-log.jsonl | tail -n 40`
- `git log --oneline --reverse origin/dev..ae901573ee78ba751247923fa5d97441311424e8`
- `git diff --name-only origin/dev...ae901573ee78ba751247923fa5d97441311424e8`
- `git show --stat --summary --format=fuller ae901573ee78ba751247923fa5d97441311424e8`
- `git show ae901573ee78ba751247923fa5d97441311424e8:apps/api/src/modules/auth/driver-device-session.repository.ts | nl -ba | sed -n '90,160p'`
- `git show ae901573ee78ba751247923fa5d97441311424e8:apps/api/src/modules/auth/driver-device-session.repository.ts | nl -ba | sed -n '248,292p'`
- `git show ae901573ee78ba751247923fa5d97441311424e8:apps/api/src/modules/auth/driver-device-session.service.ts | nl -ba | sed -n '100,160p'`
- `git show ae901573ee78ba751247923fa5d97441311424e8:infra/migrations/V0069__durable_session_refresh_families.sql | nl -ba | sed -n '60,84p'`
- `nl -ba docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md | sed -n '334,350p'`

Sidecar-file validation to run before / during handoff:

- `git diff --check -- support/sidecars/IAM-SES-001/IAM-SES-001-SIDECAR-REVIEW.md`

Not run here:

- runtime tests
- integration tests
- Postgres migration execution

Reason: this slice is support-only and must not mutate or re-drive the parent implementation. Parent validation status is summarized above instead.

## 10. Handoff Commands

Owner handoff after packet validation:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff IAM-SES-001-SIDECAR-REVIEW Codex2 \
  "IAM-SES-001 sidecar review packet is refreshed at support/sidecars/IAM-SES-001/IAM-SES-001-SIDECAR-REVIEW.md. It now matches current machine truth: parent IAM-SES-001 is back to status=in_progress under owner/reviewer Codex2/Codex, the latest active parent evidence is Codex's 2026-08-01T16:58:46Z failed review on ae901573ee78ba751247923fa5d97441311424e8, and the packet keeps both unresolved findings explicit: the DB-backed issue path inserts iam.refresh_families before the referenced iam.refresh_tokens row exists under the new FK, and the implementation resets family/session expiry as a sliding TTL instead of preserving separate absolute expiry. The earlier 2026-08-01T16:17:39Z handoff and two passing unit suites remain documented as historical verification evidence, and IAM-ACC-001 remains the merged dependency baseline on origin/dev at c1f02ae570e6c6ba19e460af75ddf7d71443dc20."
```

Reviewer approval command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve IAM-SES-001-SIDECAR-REVIEW \
  "IAM-SES-001 sidecar review packet matches current machine truth, correctly distinguishes the historical 2026-08-01T16:17:39Z implementation handoff from the latest 2026-08-01T16:58:46Z failed review, captures the reviewer reassignment and owner return to in_progress, and accurately summarizes the FK-ordering and absolute-expiry defects without mutating canonical truth."
```
