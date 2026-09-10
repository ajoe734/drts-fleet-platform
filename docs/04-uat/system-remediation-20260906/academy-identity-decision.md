# SR-ACADEMY-BE-001 — Driver Identity & Persistence Contract Decision

Decision owner: `SR-ACADEMY-BE-001-IDENTITY-CONTRACT` (Claude2). Reviewer: `Codex2`.
Date: 2026-09-10 UTC. Scope: narrowly-scoped correction to the shared design/schema
contract (`feature-contracts.md` §3, `schema-allocation.json` SR-ACADEMY-BE-001
entry) that blocked `SR-ACADEMY-BE-001` implementation (the parent task's own
`SR-ACADEMY-BE-001.md` under docs/04-uat/system-remediation-20260906/, as of
that task's checkpoint SHA `d09cefae69816396c799c8e62fe78c0193e14e52` — that
commit lives on the parent task's branch and is not yet present on this
branch). This document does not implement the academy backend; it authorizes
the identity model that the backend must use.

**Revision note (2026-09-10, post-review):** `Codex2` failed the prior candidate
(`4abf9db99ad98f6e71c15ca03c077482068806aa`) because §2.2's cohort definition
filtered only `fleetPartnerId` and `effective_until`, omitting the
`effective_from` lower bound and driver-level deduplication, and mischaracterized
`listPortalDrivers` as the resolver itself. This revision replaces that
definition with the exact resolver in §2.2.1, corrects the §1 description of
`listPortalDrivers`, and adds explicit future/expired/duplicate/orphan boundary
acceptance in §3. No other section's substance changed.

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
- The join pattern needed for the cohort (affiliations ⋈ registry drivers,
  both by text `driverId`) already exists in production code at
  `apps/api/src/modules/fleet-partner/fleet-partner.service.ts:487-519`
  (`listPortalDrivers`), against `admin.phase1_driver_fleet_affiliations`
  (`driver_id varchar(100)`, no FK — `infra/migrations/V0026__fleet_partner_revenue_share_runtime_snapshots.sql:14-22`)
  and `RegulatoryRegistryService.listDrivers()` (backed by
  `reg.phase1_registry_drivers`). **`listPortalDrivers` is a portal-display
  read, not an active-cohort resolver, and must not be reused verbatim for
  the academy denominator.** As written it: (a) filters only on
  `fleetPartnerId` (`fleet-partner.service.ts:488-490` `.filter((affiliation)
  => affiliation.fleetPartnerId === fleetPartnerId)`), applying no
  `effective_from`/`effective_until` window, so future and expired
  affiliations are included; (b) keeps every matching affiliation row rather
  than one row per driver, so a driver with two affiliation rows (e.g. a
  renewed or re-affiliated driver) is counted twice; (c) left-joins the
  registry and falls back to synthetic display values
  (`fleet-partner.service.ts:497-506`, e.g. `name: driver?.name ??
  affiliation.driverId`, `dispatchEligible: driver?.dispatchEligible ??
  false`) when no `reg.phase1_registry_drivers` row exists, so an orphaned
  affiliation (no matching registry identity) still yields a display row.
  These are correct choices for a portal roster view (show what exists, degrade
  gracefully) and wrong choices for a denominator (§2.2.1 below defines the
  distinct, date-scoped, registry-verified query the academy backend must use
  instead).
- A read-only isolation probe (Node/TS, no DB, no file edits) executed
  `listPortalDrivers`'s exact filter/map logic against five synthetic
  affiliation rows for one fleet — one currently active driver with a
  duplicate active row, one future-dated affiliation, one expired
  affiliation, and one affiliation with no matching registry driver — and
  confirmed the portal method returns 5 rows (all affiliations, as designed
  for portal display) while the correct current unique active cohort for
  that fleet is 1 driver. This confirms `listPortalDrivers` cannot be the
  denominator source without the additional filtering in §2.2.1.

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
| Active fleet driver cohort denominator ($N_{\text{total}}$) | new dedicated query, §2.2.1 below (not `listPortalDrivers`) | `fleet-partner` (new read port), consumed by `driver-academy` | read-only |
| Course/module/question/attempt data | `reg.phase1_driver_academy_courses`, `..._modules`, `reg.phase1_driver_quiz_questions`, `reg.phase1_driver_quiz_attempts` (`V0095`) | `driver-academy` (new) | owns |
| Durable training qualification projection | `reg.driver_training_records` (insert on pass), `reg.driver_reg_profiles.training_status` (update on pass/expiry) | schema remains `reg` (regulatory-registry domain); write grant below | narrow write grant, see 2.3 |
| `trainingRequired` dispatch-eligibility read | `reg.driver_reg_profiles.training_status` | `vehicle-eligibility` (`runtime-eligibility-evaluator.service.ts`) | out of scope — owned by `SR-WIRE-001` per `feature-contracts.md` §1.5; evaluator today only pushes a static `"training"` missing-requirement string and does not read `training_status` at all (confirmed at `apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts:341-347`) |

#### 2.2.1 Active fleet driver cohort — exact resolver definition

The denominator is the set of **distinct driver ids** with a currently-active,
registry-identified affiliation to the fleet, as of a single evaluation
instant shared by every number in one response (summary, per-course rows,
and roster). Given `fleetPartnerId` and `asOfInstant` (server "now" at the
start of request handling — the same value must be reused for every row
computed in that response so `summary` and `rows[]` never disagree):

```sql
SELECT DISTINCT a.driver_id
FROM admin.phase1_driver_fleet_affiliations a
INNER JOIN reg.phase1_registry_drivers d ON d.driver_id = a.driver_id
WHERE a.fleet_partner_id = :fleetPartnerId
  AND a.effective_from <= :asOfInstant
  AND (a.effective_until IS NULL OR a.effective_until > :asOfInstant)
```

Required semantics, all four are the corrections this revision makes over
the previously-approved (and review-rejected) definition:

- **As-of instant, not "no end date"**: `a.effective_from <= :asOfInstant AND
  (a.effective_until IS NULL OR a.effective_until > :asOfInstant)`. The prior
  wording ("`effective_until` empty or not yet expired") omitted the
  `effective_from` lower bound, so a future-dated affiliation (onboarding
  scheduled but not yet started) was counted in the current cohort.
- **Registry identity required (`INNER JOIN`, not left join with fallback)**:
  an affiliation row whose `driver_id` has no matching
  `reg.phase1_registry_drivers` row is excluded, not included with a
  synthetic fallback display value. An orphaned affiliation is not a real
  active driver for denominator purposes.
- **`DISTINCT a.driver_id`**: a driver with more than one qualifying
  affiliation row at the same instant (e.g. overlapping or re-affiliation
  records) is counted once, never once per row.
- **One `asOfInstant` per response, reused for every count**: `rows[].total`,
  `summary.completionPct`'s denominator, and any roster listing derived from
  this query in the same API response must all be computed from this exact
  query result set, not independently re-derived, so they cannot diverge.

This must be implemented as a new, explicitly-named read method (e.g.
`FleetPartnerService.resolveActiveDriverCohort(fleetPartnerId, asOfInstant):
string[]`, or an equivalent read port outside `fleet-partner` with the same
query) — it is **not** `listPortalDrivers`, and `listPortalDrivers` itself
must not be modified by this decision (it is a portal display read with its
own, intentionally more permissive, contract; see §1). Allocating this method
is listed in §2.3 for the supervisor to grant before backend implementation
resumes.

The task's `read_dependencies` list a stale path — module directory
`owned-mobility` instead of `vehicle-eligibility` — i.e.
apps/api/src/modules/owned-mobility/runtime-eligibility-evaluator.service.ts,
which does not exist; the real file is
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
- **Read** access to the new §2.2.1 cohort resolver (e.g.
  `FleetPartnerService.resolveActiveDriverCohort(fleetPartnerId,
  asOfInstant)` or an equivalent read port implementing that exact query)
  against `admin.phase1_driver_fleet_affiliations` and
  `reg.phase1_registry_drivers` for the denominator. This is a new method;
  do not reuse or relax `listPortalDrivers` for this purpose (§2.2.1).
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
- Reusing `listPortalDrivers` (or an affiliation-row count without
  `effective_from`/`effective_until` filtering, registry-identity join, and
  `DISTINCT driver_id`) as the denominator — over-counts future/expired
  affiliations, double-counts drivers with multiple affiliation rows, and
  counts orphaned affiliations with no registry identity (§2.2.1, confirmed
  by the review counterexample probe in §1).

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
- Fleet cohort query (§2.2.1 resolver) run against a fleet with 0
  affiliations/0 drivers returns `total: 0`, `completionPct: "0%"` (or
  defined empty state), not a division error.
- Existing rows (if any are manually seeded pre-migration) in
  `reg.driver_training_records` / `reg.driver_reg_profiles` are present with
  identical column values (other than `driver_id`'s type) after migration.
- Cohort boundary cases (§2.2.1), all evaluated at the same `asOfInstant`
  against one fleet:
  - **Future affiliation**: an affiliation with `effective_from > asOfInstant`
    is excluded from the cohort and from `total`.
  - **Expired affiliation**: an affiliation with `effective_until <=
    asOfInstant` is excluded from the cohort and from `total`.
  - **Duplicate active affiliation**: a driver with two affiliation rows to
    the same fleet, both currently active (e.g. overlapping validity
    windows, or a closed-then-reopened affiliation pair where one row is
    still open), is counted exactly once in `total` (`DISTINCT driver_id`).
  - **Orphan affiliation**: an affiliation row whose `driver_id` has no
    matching `reg.phase1_registry_drivers` row is excluded from the cohort
    and from `total` (inner join, no fallback row).
  - `summary.completionPct`'s denominator and every `rows[].total` in the
    same API response are numerically identical (same `asOfInstant`, same
    resolved driver-id set).

Negative:

- Inserting `reg.driver_training_records` with a `driver_id` that does not
  exist in `reg.phase1_registry_drivers` is a backend-level validation
  decision (academy backend's job, not this migration's), not a DB-level FK
  rejection — this must be explicit in the backend implementation task since
  the DB no longer enforces it structurally.
- `reg.drivers`/`reg.vehicles` row counts are unchanged before/after `V0095`.
- The cohort resolver (§2.2.1) is never called with a `driver_id`-count
  shortcut (e.g. `COUNT(*)` over the affiliation table) that would silently
  reintroduce double-counting if `DISTINCT` were dropped in a future edit;
  the backend implementation task must test this explicitly (duplicate-row
  fixture asserting count stays 1, not 2).

## 4. Cross-reference corrections made by this decision

- `feature-contracts.md` §1.5 and §3.3 invariant 1: `SR-ACADEMY-BE-001`
  migration reference corrected from stale `V0087__sr_driver_academy.sql` to
  the reserved `V0095__sr_driver_academy.sql`
  (`schema-allocation.json` already had `V0095` correct; only
  `feature-contracts.md`'s two prose references were stale), and the cohort
  denominator source corrected from `reg.drivers` to the exact resolver
  described in §2.2.1 of this document (as-of instant, `effective_from`/
  `effective_until` window, registry-identity inner join, `DISTINCT
  driver_id` — not `listPortalDrivers`).
- `schema-allocation.json` line 51 (`referenced_tables_access`): corrected
  from citing `listPortalDrivers()` as "the active fleet cohort source" to
  naming the new §2.2.1 resolver and stating that `listPortalDrivers` is a
  portal-display read that must not be reused for the denominator.
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
the identity model in §2.1–§2.4 (including the §2.2.1 cohort resolver).
