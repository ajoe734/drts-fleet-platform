# SR-IDENTITY-002-PRINCIPAL-UPSERT-CONFLICT — Identity Upsert Conflict ID Drift Repair

- **Task ID**: `SR-IDENTITY-002-PRINCIPAL-UPSERT-CONFLICT`
- **Owner**: `Claude`
- **Reviewer**: `Claude2`
- **Wave / Phase**: `system-remediation-20260906`
- **Parent Task**: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`
- **Base**: `dev`
- **Execution Branch**: `claude/sr-identity-002-principal-upsert-conflict`
- **Candidate SHA**: `ab2d11299525f40c616ab8554d90c8531500dcd5`

---

## 1. Issue Background & Root Cause Analysis

### 1.1 Source & Reproduction

- **Source**: Diagnosed via `SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER` real GitHub-hosted Postgres run
  [34467573936](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34467573936), job `102839642908`
  (candidate `10123f6af00a5342f2634a01f4d9a0e7190c2173`, workflow SHA `44f9dcb8562a4e23ea4dffbf1715749104d11651`).
- **Symptom**: C111 harness failed with `insert or update on table "identity_memberships" violates foreign key
  constraint "identity_memberships_principal_id_fkey"` inside `IdentityRepository.upsertMembership` <-
  `syncLegacyTenantUserRole` <- `TenantPartnerService.syncIdentityTenantUserRole`, triggered by
  `seedActiveTenantAdmin` calling `createTenantUser` then `updateTenantUserRole`.

### 1.2 Root Cause

`syncLegacyTenantUserRole` (`apps/api/src/modules/identity/identity.repository.ts`) generates a brand-new
`principalDraft.principalId = principal_<randomUUID>` (and likewise fresh membership/role-binding/invitation
ids) on **every** call, while the persistence layer upserts against the stable `source_ref` business key:

```sql
INSERT INTO iam.identity_principals (principal_id, source_ref, ...)
VALUES ($1, $2, ...)
ON CONFLICT (source_ref) DO UPDATE SET
  ...,
  record = EXCLUDED.record   -- BUG: overwrites the persisted row's JSON id
RETURNING record
```

- First sync (`create_tenant_user`) inserts a real row with `principal_id = P1`.
- Second sync (`update_tenant_user_role` / activate), same `source_ref`, conflicts on `source_ref`. The
  `UPDATE` branch never lists `principal_id` in its `SET` clause, so the persisted column correctly stays at
  `P1` — but `record = EXCLUDED.record` overwrote the JSON `record` column with the caller's freshly
  generated draft, which embeds `P2`. `RETURNING record` therefore reported `principalId = P2` while the
  real primary key was still `P1`.
- `upsertMembership` then received `principal.principalId === P2` from the caller and tried to insert
  `identity_memberships.principal_id = P2`, a value that was never persisted in `identity_principals` ->
  FK violation.
- The same `record = EXCLUDED.record` pattern existed in `upsertMembership`, `upsertRoleBinding`, and
  `upsertInvitation`, so fixing only `upsertPrincipal` would have merely moved the same class of bug one hop
  downstream (membership/role-binding/invitation id drift on any second sync).

This reproduces for any tenant user synced more than once after creation (e.g. invite then activate) — a real
production data-integrity bug in the legacy tenant-user identity sync path, not a test-fixture artifact.

---

## 2. Fix

`apps/api/src/modules/identity/identity.repository.ts`: in `upsertPrincipal`, `upsertMembership`,
`upsertRoleBinding`, and `upsertInvitation`, the `ON CONFLICT (source_ref) DO UPDATE SET` clause now writes:

```sql
record = jsonb_set(
  EXCLUDED.record,
  '{principalId}',
  to_jsonb(iam.identity_principals.principal_id)
)
```

(analogous `{membershipId}` / `{roleBindingId}` / `{invitationId}` for the other three tables), instead of
`record = EXCLUDED.record`. On conflict, the returned JSON's id field is patched to the actually-persisted,
immutable primary-key column rather than the caller's newly generated draft id — so the returned record and
the real row can never diverge again, on any resync count. No primary key is ever rotated; no FK is dropped;
first-insert behavior is unchanged (the `jsonb_set` only overwrites the id field with a value that, on first
insert, already equals what was just inserted).

---

## 3. Verification & Acceptance Evidence

### 3.1 Regression Suite
(`tests/unit/system-remediation/sr-identity-002-principal-upsert-conflict/`)

- `fake-conflict-aware-pg-client.ts`: a minimal Postgres-semantics interpreter, scoped to the
  `INSERT ... ON CONFLICT (...) DO UPDATE SET ... RETURNING ...` shapes `IdentityRepository`'s upsert helpers
  send. It regex-parses the *actual* SQL text (columns, `VALUES` placeholders, `ON CONFLICT` target, each
  `SET` assignment including `jsonb_set(...)`, `RETURNING` list) and evaluates it against an in-memory table,
  rather than hard-coding the current fix's expected outcome. It therefore fails the same way real Postgres
  would if the `record = EXCLUDED.record` regression were reintroduced.
- `principal-upsert-conflict.test.ts`:
  - Reproduces invite -> activate resync of the same `source_ref` and asserts the returned
    principal/membership/role-binding/invitation ids stay stable across both calls, and match the actually
    persisted primary-key columns (the exact invariant that broke as
    `identity_memberships_principal_id_fkey` in real Postgres).
  - Asserts the invitation FK stays stable across three repeated resyncs (invite, activate, role change).
  - Asserts concurrent resyncs of the same `source_ref` (`Promise.all`) converge on the one persisted
    principal row, with every membership's `principal_id` pointing at a principal that actually exists.
- **Verified this suite reproduces the old failure**: temporarily restored the pre-fix
  `identity.repository.ts` (from `dev@8ee0afcce`) and re-ran the suite — all 3 tests failed with the exact id
  divergence described above (e.g. `expected 'principal_fbd5...' to be 'principal_e19b...'`). Restored the
  fixed file (working tree returned to byte-identical with the committed candidate) and re-ran — all 3 pass.

### 3.2 Verification Commands Run & Results

```bash
# 1. Regression suite:
pnpm exec vitest run tests/unit/system-remediation/sr-identity-002-principal-upsert-conflict/ --no-file-parallelism --maxConcurrency=1
# Output: 3 passed (3)

# 2. Sibling canonical identity repository suite (no regressions introduced):
pnpm exec vitest run tests/unit/identity-canonical-repository.test.ts --no-file-parallelism --maxConcurrency=1
# Output: 7 passed (7)

# 3. Typecheck (after `pnpm --filter @drts/contracts build`, which populates packages/contracts/dist that
#    this checkout's tsconfig path-maps against; unrelated to this change):
pnpm --filter @drts/api typecheck
# Output: tsc -p tsconfig.json --noEmit (Exit status 0)

# 4. ESLint check:
pnpm exec eslint tests/unit/system-remediation/sr-identity-002-principal-upsert-conflict/ apps/api/src/modules/identity/identity.repository.ts
# Output: clean (Exit status 0)

# 5. Git diff check:
git diff --check
# Output: clean (Exit status 0)
```

No product server, browser server, or Docker Compose was started (per VM restriction).

### 3.3 Remaining Acceptance Gate

`required_acceptance: identity_upsert_remote_pg_http_sql` and the acceptance line "real remote tenant JWT
HTTP SQL acceptance has 2 passed and 0 skipped against exact replacement runtime SHA" require a real
GitHub-hosted Postgres run against this exact candidate SHA (`ab2d11299525f40c616ab8554d90c8531500dcd5`) —
this worker VM cannot start that infrastructure locally. Per the task's integration notes, after this fix is
reviewed, a new combined runtime SHA (containing both the original `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`
security fix and this identity fix) must be produced and rebaselined through the canonical candidate/review
lifecycle before `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` acceptance closeout. Review, CI, merge, and external
PG/HTTP acceptance remain outstanding lifecycle gates.

---

## 4. Modified / Added Artifacts

- `apps/api/src/modules/identity/identity.repository.ts`
- `tests/unit/system-remediation/sr-identity-002-principal-upsert-conflict/fake-conflict-aware-pg-client.ts`
- `tests/unit/system-remediation/sr-identity-002-principal-upsert-conflict/principal-upsert-conflict.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-IDENTITY-002-PRINCIPAL-UPSERT-CONFLICT.md`
