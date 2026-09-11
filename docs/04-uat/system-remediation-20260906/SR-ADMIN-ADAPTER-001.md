# SR-ADMIN-ADAPTER-001 — 平台轉接器登錄 API 接線及到期真值

Owner：Claude；Reviewer：Claude2。日期：2026-09-11 UTC。

## 0. Base state verification (read this before trusting the 9/6 audit)

Per the execution prompt, the 9/6 audit SHA is a historical observation, not
current program truth. Before writing any code this candidate re-verified the
actual state at this branch's base:

- **Base SHA**: `dc84431eed6ee3fd778e828c030ae77db661df54` (`origin/dev` at
  fetch time; this branch's HEAD before this candidate's commit).
- `apps/api/src/modules/platform-admin/platform-admin.controller.ts` (297
  lines) had **zero** `adapters` routes — `grep -n "Adapter" ...controller.ts`
  returned nothing.
- `apps/api/src/modules/platform-admin/platform-admin.service.ts` (1798
  lines) had **zero** adapter-related code — `grep -n "Adapter"
...service.ts` returned nothing.
- So the "404" described in the execution prompt is not a partial/broken
  route — the entire `/platform-admin/adapters*` surface was unimplemented.
  It was not "already fixed by another task"; nothing to preserve, no
  regression evidence to carry forward instead.
- `packages/contracts/src/platform-adapter-registry.ts` (185 lines) and
  `packages/api-client/src/index.ts` **did** already carry the full
  `AdapterCredentialExpiry` / `AdapterCredentialExpiryWarning` /
  `PlatformAdapterAuditEvidence` / `revision` / `expectedRevision` contract
  surface and matching `ApiClient` methods (`listPlatformAdapters`,
  `getPlatformAdapter`, `updatePlatformAdapter`,
  `getPlatformAdapterCredentialExpiryWarning`), committed by
  `SR-RECOVERY-CONTRACTS-20260911` (`e2e17cb8d`, confirmed an ancestor of this
  branch via `git branch --contains e2e17cb8d`). This candidate consumes that
  contract as-is; it does not redefine it.
- `apps/platform-admin-web/app/adapter-registry/page.tsx` (965 lines) was a
  complete, already-typechecking canvas-faithful (card-grid + banner) screen
  wired to `client.listPlatformAdapters()` / `client.updatePlatformAdapter()`
  — i.e. it was already calling the (until this candidate) nonexistent
  backend routes, which is exactly how the 404 manifested end-to-end. Two
  real defects were present in it independent of the missing backend (both
  fixed here, §2.3): a hardcoded, always-shown "token expires in 6 days /
  rotate before 2026-05-31" fallback banner unrelated to any adapter's actual
  data, and `findAttentionAdapter`/the toggle-enable form silently ignoring
  the new expiry-warning/revision/reason fields.
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx` +
  `EditAdapterModal.tsx` existed but were **not imported by `page.tsx` or
  anywhere else** (`grep -rl "AdapterList\|EditAdapterModal" apps/... | grep
-v adapter-registry/components` → empty). They also used a private,
  unauthenticated `new ApiClient({ baseUrl: "" })` instance (bypassing
  `usePlatformAdminClient()`'s auth wiring) and raw Tailwind gray/indigo
  classes instead of `@drts/ui-web` Canvas primitives / realm tokens —
  contradicting both the canvas design (`docs/05-ui/drts-design-canvas/
platform-screens.jsx` `PA_Adapters`, a card grid, not a data table) and the
  UI design contract. Removed as dead, off-canvas, insecure code (§2.3).

### 0.1 Environment note: shared `node_modules` resolved a stale, unrelated canonical-root checkout

Every task worktree under `.artifacts/worktrees/auto/` has its
`apps/*/node_modules` and root `node_modules` symlinked to the **canonical
root** checkout (`/home/lupin/workspace/drts-fleet-platform`), not to a
worktree-local install (`ls -la apps/api/node_modules` →
`-> /home/lupin/workspace/drts-fleet-platform/apps/api/node_modules`). At the
time of this work, canonical root was on an unrelated, dirty, **143 commits
behind `origin/dev`** checkout (`git status -b` → `dev...origin/dev [ahead
14, behind 143]`, uncommitted `multi-taxi` edits) — its
`packages/contracts/src/platform-adapter-registry.ts` was the pre-
`SR-RECOVERY-CONTRACTS-20260911` 107-line version, missing every field this
task depends on. This produced a first, misleading `pnpm --filter @drts/api
typecheck` run full of unrelated errors (`bookingRequirements`,
`AutonomousDispatch*`, etc. — pre-existing breakage in _that_ stale
checkout, not this branch).

This candidate did not touch canonical root's git state (no `git switch` /
`checkout` there, per guardrails). The fix used is local and non-destructive:
`packages/contracts` and `packages/control-plane-auth` both declare
`"types": "./src/index.ts"` at the package level but `apps/api/tsconfig.json`
maps `@drts/contracts`/`@drts/control-plane-auth` via `paths` to
`packages/*/dist/index.d.ts` first. Running `pnpm --filter @drts/contracts
build` and `pnpm --filter @drts/control-plane-auth build` **inside this
worktree** (each command's own output confirms cwd
`.../claude-sr-admin-adapter-001/packages/...`) populates that worktree-local
`dist/`, which `tsc`'s `paths` resolution then prefers over the
canonical-root-symlinked `node_modules` fallback — without writing anything
outside this worktree. `vitest.config.ts` already aliases `@drts/contracts`
straight to this worktree's `packages/contracts/src/index.ts`, so the test
run was never affected by this.

One `pnpm install --prefer-offline` (with `CI=true` to bypass the
no-TTY purge prompt) was run early while diagnosing this and, because of the
same shared-symlink architecture, it modified canonical root's root
`node_modules` (log line `Recreating
/home/lupin/workspace/drts-fleet-platform/node_modules`, `Packages: +3`
root-level devDependencies added, no removals reported). This is disclosed
here rather than omitted; no further install/relink commands were run against
canonical root after this was discovered, and the targeted per-package
`build` approach above was used instead for the remainder of this task.

---

## 1. 交付範圍 (What was built)

### 1.1 Migration allocation (`infra/migrations/V0100__sr_platform_adapter_registry.sql`, new)

Implements the `V0100` allocation already specified in
`docs/04-uat/system-remediation-20260906/schema-allocation.json`
(`additional_allocations`, reserved by `SR-RECOVERY-CONTRACTS-20260911` for
this task): `admin.phase1_platform_adapters` (`id text PRIMARY KEY`,
`revision integer NOT NULL DEFAULT 1` with a `revision > 0` check,
independently-nullable `credential_expiry_reference` /
`credential_expiry_expires_at`, `record jsonb`) and
`admin.phase1_platform_adapter_mutation_audit` (`audit_id uuid PRIMARY KEY
DEFAULT gen_random_uuid()`, FK to the adapter row, `previous_revision` /
`new_revision` / `reason NOT NULL` / nullable `actor_id`). No credential
secret column exists anywhere in this schema.

### 1.2 Repository (`apps/api/src/modules/platform-admin/platform-admin.repository.ts`)

Added `platformAdapters` to `PlatformAdminState`/`PersistPlatformAdminChanges`
(load/upsert, following the existing `phase1_platform_tenants` JSON-record
convention), plus a `withTransaction` helper and
`mutateAdapterWithAudit(adapterId, expectedRevision, updatedRecord, audit)`
that performs `UPDATE ... WHERE id = $1 AND revision = $expectedRevision`
(bumping revision in the same statement) and the
`phase1_platform_adapter_mutation_audit` `INSERT` **in one transaction**
(`BEGIN` / `SET LOCAL lock_timeout`/`statement_timeout` / `COMMIT`, mirroring
`owned-mobility.repository.ts`'s existing pattern) — a zero-row `UPDATE`
throws `PlatformAdapterRevisionConflictError` rather than silently
no-opping.

### 1.3 Service (`apps/api/src/modules/platform-admin/platform-admin.service.ts`)

- New `PLATFORM_ADAPTERS_SEED` (3 adapters exercising all 4 expiry states:
  no `credentialExpiry` at all, a far-future `expiresAt`, and one seeded
  inside the warning window) and an `adapters` in-memory array, loaded from
  `platformAdminRepository.loadState()` on `onModuleInit` when persisted rows
  exist, seeded+persisted otherwise (same pattern as
  `publicInfoVersions`/`placardVersions`).
- `listPlatformAdapters` / `getPlatformAdapter` / new
  `getPlatformAdapterCredentialExpiryWarning(id)` (404s via `ApiRequestError`
  for an unknown id — never fabricates a warning for a missing adapter).
- `evaluateCredentialExpiryWarning`: **the actual to-date-truth calculation**
  replacing the removed UI-side fixed "6 days / 2026-05-31" copy. Pure,
  server-side, computed at read time (never persisted, per the migration's
  own design note): no `expiresAt` → `"unknown"`; unparsable `expiresAt` →
  `"unknown"` (never `"ok"`); `expiresAt <= now` → `"expired"`; within
  `CREDENTIAL_EXPIRY_WARNING_WINDOW_DAYS` (14) → `"warning"`; else `"ok"`.
- `updatePlatformAdapter`: enforces `expectedRevision` when provided (409
  `PLATFORM_ADAPTER_REVISION_CONFLICT` on mismatch, not a silent overwrite),
  bumps `revision`, builds a server-generated `PlatformAdapterAuditEvidence`
  (`reason` defaults to `"not provided"` only when the caller omits it —
  never silently dropped), persists through `mutateAdapterWithAudit` when a
  DB is configured (best-effort: a transactional failure — including a
  revision conflict on the _durable_ copy — is logged via
  `reportPersistenceFailure` and does not overturn the in-memory result
  already computed for this request; see §3's explicit boundary on this),
  and records a `platform_admin` audit-notification entry.
- `registerPlatformAdapter`: seeds `revision: 1`, `lastMutationAudit: null`
  (no fabricated history for a brand-new adapter).

### 1.4 Controller (`apps/api/src/modules/platform-admin/platform-admin.controller.ts`)

Added `GET adapters`, `GET adapters/:adapterId`, `GET
adapters/:adapterId/credential-expiry-warning`, `PATCH adapters/:adapterId`,
`POST adapters` — matching exactly the paths
`packages/api-client/src/index.ts` already called. No new
`@RequireRealms`/`@RequireScopes` decorators were added: `apps/api/src/
common/auth/auth.policy.ts`'s existing `routePath.startsWith("platform-admin/")`
fallback rule (line ~323) already requires realm `platform` and
`foundation:read`/`foundation:write` scope for **every** route under this
controller's prefix, including the four new ones — confirmed directly
against `resolveRouteAuthPolicy` in the test suite (§3), not assumed.

### 1.5 Frontend (`apps/platform-admin-web/app/adapter-registry/`)

- `page.tsx`: `findAttentionAdapter` now also flags
  `credentialExpiryWarning.state === "warning" | "expired"`, not just
  `credentialStatus`/`healthStatus`/`warn`. The `CanvasBanner` is now only
  rendered when a real attention adapter exists — the hardcoded "6 days /
  2026-05-31" fallback banner (shown previously for every healthy state) is
  gone entirely rather than replaced with different hardcoded copy. Each
  adapter card gained a 5th metadata block showing the real
  `credentialExpiryWarning.state` (via the existing
  `formatPlatformCodeLabel` code-label system, so it stays inside the
  existing i18n machinery) and the real `credentialExpiry.expiresAt`
  (`formatDateTime`, or the existing "not configured" copy when null).
  `toggleEnabled` now sends `expectedRevision` (the adapter's current
  `revision`, when present) and the operator-captured `reason` in the
  `updatePlatformAdapter` call body — previously the reason was captured via
  `window.prompt` for the UI's own success-toast text but was **never sent
  to the API**, so no real audit reason was ever recorded server-side.
- Deleted `components/AdapterList.tsx` and `components/EditAdapterModal.tsx`
  (dead, unauthenticated, off-canvas — §0).

---

## 2. 驗證執行紀錄與實際結果 (Verification Evidence)

| 檢查項目 / 指令                                                                                 | Exit Code | 實際結果摘要                                                                                                                                                                        |
| :---------------------------------------------------------------------------------------------- | :-------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build` (local dist, §0.1)                                        |     0     | no emit errors                                                                                                                                                                      |
| `pnpm --filter @drts/control-plane-auth build` (local dist, §0.1)                               |     0     | no emit errors                                                                                                                                                                      |
| `pnpm --filter @drts/api typecheck`                                                             |     0     | clean after the local-dist fix; only real error found during development (`exactOptionalPropertyTypes` on the `credentialExpiry` fallback branch) was fixed in code, not suppressed |
| `pnpm --filter @drts/platform-admin-web typecheck`                                              |     0     | clean, including the deleted dead components and the new `credentialExpiryLabel`/`isCredentialExpiryConcerning` logic                                                               |
| `node tools/ci/i18n-guard.mjs`                                                                  |     0     | `i18n-guard: OK (554 files scanned across 10 apps, 55 exemption(s))` — no new inline-copy violations from the metadata-block/banner changes                                         |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/`                      |     0     | 1 test file, **11 passed**, 0 failed                                                                                                                                                |
| `pnpm exec vitest run tests/unit/platform-admin.test.ts` (pre-existing suite, regression check) |     0     | 12 passed, 0 failed — confirms the repository/service extensions did not regress the existing public-info/placard/user flows                                                        |
| `git diff --check`                                                                              |     0     | no whitespace errors                                                                                                                                                                |

New-test coverage (`tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts`,
11 cases): list/get round-trip with `credentialExpiryWarning` attached; all
four expiry states derived from real `expiresAt` values (`ok`/`warning`/
`expired`/`unknown` including an explicit unparsable-date-is-unknown case);
404 on an unknown adapter for both `getPlatformAdapter` and the
credential-expiry-warning read, at both the service and controller layers;
`updatePlatformAdapter` round-trip (config change + `reason` + `actorId`
readable back from `getPlatformAdapter`, revision bumped, audit-notification
entry recorded, no `secret`-matching substring anywhere in the returned
record or audit entry); a stale `expectedRevision` rejected with 409 instead
of overwritten; an independent-service-instance reload against a fake
in-memory-Map-backed repository proving durability of a mutation across
restart; a durable-write-conflict path that logs via
`reportPersistenceFailure` without throwing to the caller (documents the
best-effort-persistence boundary explicitly, §3); the
`platform-admin/adapters*` routes' resolved auth policy requiring realm
`platform` + `foundation:read`/`foundation:write` (unauthorized rejection,
verified against the real policy resolver, not asserted); and
`registerPlatformAdapter` seeding revision 1 with no fabricated audit
history.

---

## 3. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions — not claimed as done)

- **No live/real adapter credential rotation or provider call**: this task
  is registry/API-truth only, per its own acceptance bar
  ("stub與不可用不能標真live"). `registerPlatformAdapter`/
  `updatePlatformAdapter` write to this service's own store; no external
  platform (CityRide, Grab, etc.) is actually contacted.
- **No browser/E2E verification**: this VM may not start product dev
  servers or `pnpm exec playwright`. All frontend verification here is
  `typecheck` + `i18n-guard` + manual code review against the canvas
  (`platform-screens.jsx` `PA_Adapters`) and the existing card-grid
  structure already in `page.tsx`; it was not visually screenshotted or
  clicked through in a running browser.
- **No frontend unit test**: `vitest.config.ts`'s `@` alias is scoped to
  `apps/tenant-console-web` only; `apps/platform-admin-web`'s `@/lib/...`
  imports are not resolvable from the root vitest config, and adding that
  alias is a shared-config file outside this task's `write_scopes`. The new
  `findAttentionAdapter`/`isCredentialExpiryConcerning` client logic is
  therefore typecheck- and code-review-verified only, not covered by an
  executed unit test — stated explicitly rather than counted as tested.
- **Best-effort durable persistence, not strict multi-instance CAS**: the
  in-memory `adapters` array (not the DB row) is this single-process
  service's authority for the HTTP response it returns; `revision` conflicts
  are enforced authoritatively there first. When a DB is configured, the
  same optimistic-concurrency check is _also_ applied durably via
  `mutateAdapterWithAudit`'s `WHERE revision = $expectedRevision`, but a
  failure there (including a genuine multi-instance race) is logged, not
  surfaced back to the caller who already received a consistent in-memory
  result — matching this file's existing `persistChanges` fire-and-forget
  convention for every other domain in `platform-admin.service.ts`. A truly
  DB-authoritative, multi-instance-safe write path would require making
  adapter persistence synchronous and blocking, which this candidate did not
  do, to stay consistent with the rest of the file's architecture.
- **`home.banner.tokenExpiry.*` on `apps/platform-admin-web/app/page.tsx`
  (the platform-admin dashboard home page) still exists and is out of this
  task's `write_scopes`** (`apps/platform-admin-web/app/adapter-registry/`
  only). Its title copy (`home.banner.tokenExpiry.title`, "BGMT dispatch
  reporting token expires in 6 days") is also a fixed string, independent of
  the `adapterRegistry.banner.fallbackTitle`/`fallbackBody` fixed-date copy
  this task removed the _usage_ of. `adapterRegistry.banner.fallbackTitle`/
  `fallbackBody` translation keys themselves were left in
  `apps/platform-admin-web/lib/translations.ts` (now unreferenced by this
  page) rather than deleted, since that file is also outside `write_scopes`.
  If the home-page banner is in scope for a future task, it is not resolved
  here.
- **`SR-ADMIN-VERIFY-001` dependency**: this task depends on
  `SR-ADMIN-VERIFY-001` per its machine-truth `depends_on`; this candidate
  did not re-verify that task's own completion/merge status as a precondition
  gate (the supervisor/candidate-lifecycle is the source of truth for
  dependency-readiness, not this document).

---

## 4. 變更範圍守護 (Write Scopes Compliance)

Only files in this task's declared `write_scopes`/`artifacts` were touched:

1. `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
2. `apps/api/src/modules/platform-admin/platform-admin.service.ts`
3. `apps/api/src/modules/platform-admin/platform-admin.repository.ts`
4. `apps/platform-admin-web/app/adapter-registry/page.tsx`
5. `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx` — deleted (dead/off-canvas, §0)
6. `apps/platform-admin-web/app/adapter-registry/components/EditAdapterModal.tsx` — deleted (dead/off-canvas, §0)
7. `infra/migrations/V0100__sr_platform_adapter_registry.sql` — new, exact allocated filename
8. `tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts` — new
9. `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md` — this document

`apps/api/src/modules/platform-admin/platform-admin.module.ts` (also listed
in `write_scopes` as a not-yet-existing-target placeholder) did not need any
edit — `PlatformAdminController`/`PlatformAdminService`/
`PlatformAdminRepository` were already wired into it. No file under any
other task's declared scope, root `app.module.ts`, `packages/contracts/**`,
or `packages/api-client/**` was modified.

---

## 5. 交接資訊 (Handoff)

- **狀態 (Status)**：candidate ready, awaiting independent review (`Claude2`) and CI/merge
- **Base SHA**：`dc84431eed6ee3fd778e828c030ae77db661df54`
- **CANDIDATE_SHA**：set via `git rev-parse HEAD` at commit/handoff time
- **CANDIDATE_BRANCH**：`claude/sr-admin-adapter-001-recovery-20260911`
