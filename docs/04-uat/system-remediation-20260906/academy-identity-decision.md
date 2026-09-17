# SR-ACADEMY-BE-001 — Driver Identity & Persistence Contract Decision

Decision owner: `SR-ACADEMY-BE-001-IDENTITY-CONTRACT` (Claude2). Reviewer: `Codex2`.
Date: 2026-09-10 UTC. Scope: narrowly-scoped correction to the shared design/schema
contract (`feature-contracts.md` §3, `schema-allocation.json` SR-ACADEMY-BE-001
entry) that blocked `SR-ACADEMY-BE-001` implementation
(`docs/04-uat/system-remediation-20260906/SR-ACADEMY-BE-001.md`, checkpoint SHA
`d09cefae69816396c799c8e62fe78c0193e14e52`). This document does not implement the
academy backend; it authorizes the identity model that the backend must use.

## 1. Reproduction (fresh `origin/dev`, `ccfbf3bfdcb878da0160091fc483d555505fae2a`)

- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:891` and
  `:2121` (`createDriver`, `provisionDriverFromDraft`) mint runtime driver ids as
  `` `drv_${randomUUID()}` `` — a text id, not a `reg.drivers` uuid.
- `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts:371`
  persists these to `reg.phase1_registry_drivers`, whose PK is
  `driver_id varchar(100)` (`infra/migrations/V0012__phase1_remaining_runtime_snapshots.sql:18-19`).
- `infra/migrations/V0004__regulatory_registry.sql:83-118` declares
  `reg.drivers.driver_id` as `uuid PRIMARY KEY DEFAULT gen_random_uuid()`, with
  `reg.driver_reg_profiles.driver_id` and `reg.driver_training_records.driver_id`
  as **real FKs** to `reg.drivers(driver_id)`.
- No code path inserts into `reg.drivers`, `reg.driver_reg_profiles`, or
  `reg.driver_training_records`:
  `rg -n "INSERT INTO reg\.drivers|INSERT INTO reg\.driver_reg_profiles|INSERT INTO reg\.driver_training_records" apps/api/src -g '*.ts'`
  returns no matches. The one existing reference,
  `regulatory-registry.repository.ts:1106` (`FROM reg.drivers d LEFT JOIN
  reg.driver_reg_profiles dp ...`), is a one-time credential backfill `SELECT`
  that reads zero rows in practice because `reg.drivers` is never populated.
- This is the same trap already fixed once for a sibling table pair:
  `infra/migrations/V0055__p5_disclosure_ids_as_varchar.sql:1-17` documents
  `ERROR: invalid input syntax for type uuid: "drv_fbc58402-..."` against
  `reg.driver_public_registration_credentials` and converts it (and
  `reg.vehicle_passenger_disclosure_profiles`) from `uuid` FK to
  `varchar(100)` with the FK dropped, matching the text-id convention already
  used by `fleet.supply_submissions` (V0050), `safety.driver_sos_events`
  (V0052), and `mobility.runtime_eligibility_decisions`.
- `feature-contracts.md` §3.3 invariant 1 currently cites `reg.drivers` as the
  active fleet driver cohort denominator source. Since `reg.drivers` is never
  written, that denominator would always resolve to zero — it cannot be
  authoritative.
- An authoritative fleet↔driver cohort resolver already exists and is already
  proven in production code:
  `apps/api/src/modules/fleet-partner/fleet-partner.service.ts:487-519`
  (`listPortalDrivers`) joins `admin.phase1_driver_fleet_affiliations`
  (`driver_id varchar(100)`, no FK — `infra/migrations/V0026__fleet_partner_revenue_share_runtime_snapshots.sql:14-22`),
  filtered by `fleetPartnerId` and affiliation validity, against
  `RegulatoryRegistryService.listDrivers()` (backed by
  `reg.phase1_registry_drivers`) by the same text `driverId`.

## 2. Decision

### 2.1 Identity contract

The runtime driver identity is the **text id** minted by
`regulatory-registry.service.ts` (`drv_<uuid>` today, opaque `varchar(100)`
going forward) and persisted in `reg.phase1_registry_drivers.driver_id`. This is
the only driver identity any runtime write path actually creates. All
academy-domain tables — the four new SR-ACADEMY-BE-001 primary tables
(`V0095__sr_driver_academy.sql`) and the two existing shared regulatory tables
the academy backend must write to
(`reg.driver_training_records`, `reg.driver_reg_profiles`) — key `driver_id` as
`varchar(100)` against that identity. No prefix stripping, hashing, casting to
`uuid`, or synthetic `reg.drivers` parent-row creation is authorized. `reg.drivers`
is treated as dormant/superseded schema, exactly like the pre-V0055 state of the
disclosure tables; it is not deleted and not written to by this decision.

### 2.2 Ownership

| Concern | Authoritative source | Owner module | Academy access |
| :--- | :--- | :--- | :--- |
| Driver identity minting | `reg.phase1_registry_drivers` | `regulatory-registry` | read-only |
| Fleet↔driver active affiliation | `admin.phase1_driver_fleet_affiliations` | `fleet-partner` | read-only |
| Active fleet driver cohort denominator ($N_{\text{total}}$) | join of the two rows above (same join `listPortalDrivers` already performs), scoped to `fleetPartnerId` and `effective_until IS NULL OR effective_until > now()` | `fleet-partner` (read), consumed by `driver-academy` | read-only |
| Course/module/question/attempt data | `reg.phase1_driver_academy_courses`, `..._modules`, `reg.phase1_driver_quiz_questions`, `reg.phase1_driver_quiz_attempts` (`V0095`) | `driver-academy` (new) | owns |
| Durable training qualification projection | `reg.driver_training_records` (insert on pass), `reg.driver_reg_profiles.training_status` (update on pass/expiry) | schema remains `reg` (regulatory-registry domain); write grant below | narrow write grant, see 2.3 |
| `trainingRequired` dispatch-eligibility read | `reg.driver_reg_profiles.training_status` | `vehicle-eligibility` (`runtime-eligibility-evaluator.service.ts`) | out of scope — owned by `SR-WIRE-001` per `feature-contracts.md` §1.5; evaluator today only pushes a static `"training"` missing-requirement string and does not read `training_status` at all (confirmed at `apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts:341-347`) |

The task's `read_dependencies` list a stale path,
`apps/api/src/modules/owned-mobility/runtime-eligibility-evaluator.service.ts`;
the real file is
`apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts`.
Supervisor should correct this in the task's machine record; not fixed here
since it is outside this task's `write_scopes`.

### 2.3 Additional runtime scopes SR-ACADEMY-BE-001 backend implementation needs

Beyond the four new tables it already owns, the backend needs:

- **Write** (`INSERT`) to `reg.driver_training_records`, one row per passed
  attempt.
- **Write** (`UPDATE ... SET training_status`) to `reg.driver_reg_profiles`,
  restricted to the `training_status` column, driven only by required-course
  pass/expiry transitions (no other column of that table is in scope).
- **Read** access to `RegulatoryRegistryService.listDrivers()` /
  `reg.phase1_registry_drivers` and to `admin.phase1_driver_fleet_affiliations`
  (via `FleetPartnerService` or an equivalent read port) for the cohort
  denominator.
- A `driver_reg_profiles` row does not currently exist for any `drv_<uuid>`
  runtime driver (no insert path populates it — see §1). The backend's
  first-pass-write must `INSERT ... ON CONFLICT (driver_id) DO UPDATE` (upsert)
  rather than assume a pre-existing row, since there is no other task that
  creates one.

These are listed for the supervisor to allocate to `SR-ACADEMY-BE-001`'s
`read_dependencies`/write scopes before backend implementation resumes; this
decision does not itself grant them in `apps/api`.

### 2.4 Migration correction owned by `V0095__sr_driver_academy.sql`

In addition to creating the four new academy tables with `driver_id
varchar(100)` (no FK to `reg.drivers`), `V0095` must carry the same corrective
`ALTER` pattern `V0055` already used for the disclosure tables:

```sql
ALTER TABLE IF EXISTS reg.driver_training_records
  DROP CONSTRAINT IF EXISTS driver_training_records_driver_id_fkey;
ALTER TABLE IF EXISTS reg.driver_training_records
  ALTER COLUMN driver_id TYPE varchar(100) USING driver_id::text;

ALTER TABLE IF EXISTS reg.driver_reg_profiles
  DROP CONSTRAINT IF EXISTS driver_reg_profiles_driver_id_fkey;
ALTER TABLE IF EXISTS reg.driver_reg_profiles
  ALTER COLUMN driver_id TYPE varchar(100) USING driver_id::text;
```

`USING driver_id::text` is a lossless cast (works whether the column holds
real uuids or is empty) and is idempotent/deploy-safe under `IF EXISTS` guards,
matching V0055's precedent. It does **not** touch `reg.drivers`,
`reg.vehicles`, or any other table. `reg.driver_reg_profiles.driver_id` remains
that table's primary key; only its type and FK constraint change.

### 2.5 Forward compatibility / preservation

- No destructive rewrite: no `DROP TABLE`, `TRUNCATE`, or data-losing `ALTER`.
  The `::text` cast preserves any existing row verbatim.
- Because no runtime write path has ever populated `reg.drivers`,
  `reg.driver_reg_profiles`, or `reg.driver_training_records` (§1), the
  practical row count affected by the `ALTER` is expected to be zero in every
  deployed environment reachable from this repo state. The migration must
  still be correct if that assumption is wrong (e.g. manually-seeded demo
  rows), which is exactly why it is a type-preserving cast rather than a
  drop/recreate.
- No backfill is required for existing data because there is no existing
  academy data; this is a schema-shape correction, not a data migration.

### 2.6 Explicitly rejected approaches

- Stripping the `drv_` prefix or hashing/casting the runtime text id to `uuid`
  to satisfy the existing FK — invents an identity mapping that does not exist
  anywhere in the runtime.
- Auto-creating a synthetic `reg.drivers` parent row on first academy write —
  invents a second, unsynchronized copy of driver identity.
- A no-op or fixture `training_status` update that does not actually persist
  through the real FK-constrained path — reproduces the exact
  `FX_FLEET_TRAINING` fixture problem this contract exists to remove
  (`feature-contracts.md` §1.2, `authoritative_model_rule` in
  `schema-allocation.json`).
- Sourcing the cohort denominator from `reg.drivers` — always zero, silently
  wrong dashboards.

## 3. Required remote acceptance (not run here — VM restriction, no live DB)

Positive:

- Applying `V0095` (with the §2.4 `ALTER`s) against a fresh copy of `dev`'s
  schema succeeds and is re-runnable (idempotent).
- Inserting a `reg.driver_training_records` row with
  `driver_id = 'drv_<real-uuid>'` (a real id produced by `createDriver`)
  succeeds without FK violation.
- Upserting `reg.driver_reg_profiles.training_status` for that same
  `driver_id` succeeds and is readable back with the same value.
- A driver who passes every `isRequired: true` course reads back
  `training_status = 'passed'`; a driver with one expired required course
  reads back `'expired'`.
- Fleet cohort query (§2.2 join) run against a fleet with 0 courses/0 drivers
  returns `total: 0`, `completionPct: "0%"` (or defined empty state), not a
  division error.
- Existing rows (if any are manually seeded pre-migration) in
  `reg.driver_training_records` / `reg.driver_reg_profiles` are present with
  identical column values (other than `driver_id`'s type) after migration.

Negative:

- Inserting `reg.driver_training_records` with a `driver_id` that does not
  exist in `reg.phase1_registry_drivers` is a backend-level validation
  decision (academy backend's job, not this migration's), not a DB-level FK
  rejection — this must be explicit in the backend implementation task since
  the DB no longer enforces it structurally.
- `reg.drivers`/`reg.vehicles` row counts are unchanged before/after `V0095`.

## 4. Cross-reference corrections made by this decision

- `feature-contracts.md` §1.5 and §3.3 invariant 1: `SR-ACADEMY-BE-001`
  migration reference corrected from stale `V0087__sr_driver_academy.sql` to
  the reserved `V0095__sr_driver_academy.sql`
  (`schema-allocation.json` already had `V0095` correct; only
  `feature-contracts.md`'s two prose references were stale), and the cohort
  denominator source corrected from `reg.drivers` to the join described in
  §2.2 of this document.
- `feature-contracts.md` §3.3 invariant 4 and §3.7 `AC-ACAD-POS-3`: unchanged
  in effect (`reg.driver_training_records` insert,
  `reg.driver_reg_profiles.training_status` update) but now cross-reference
  this decision for the identity type.
- `schema-allocation.json` SR-ACADEMY-BE-001 allocation entry: `reg.drivers`
  removed from `referenced_tables` (replaced by
  `reg.phase1_registry_drivers` and `admin.phase1_driver_fleet_affiliations`,
  both read-only), and a `modifies_existing_tables` field added documenting
  the §2.4 `ALTER`s. See that file's own diff for the exact shape.

`SR-LEAVE-BE-001`'s and `SR-HOST-BE-001`'s stale `V0086`/`V0088` prose
references in `feature-contracts.md` §1.5 are pre-existing and out of this
task's scope (leave/Host business rules are explicitly excluded); only the
academy line was corrected.

## 5. Status

This is a design/schema contract correction only. `SR-ACADEMY-BE-001`
(parent, owner Codex2) remains blocked pending independent review of this
decision by `Codex2`, after which backend implementation may resume against
the identity model in §2.1–§2.4.
