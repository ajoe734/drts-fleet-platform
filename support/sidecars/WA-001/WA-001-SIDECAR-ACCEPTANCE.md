# WA-001 Sidecar Acceptance Packet

> **Parent Task:** `WA-001` - platform_presence backend module
> **Parent Owner / Reviewer:** `Qwen` / `Claude`
> **Sidecar Owner / Reviewer:** `Qwen` / `Codex`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Source of task truth:** `ai-status.json`, parent task commit evidence `8d33714`, review fix `1d32310`

This packet is a support artifact only. It does not modify L1 product truth, core contracts, or runtime/governance implementation. It exists to help the parent owner and reviewer close `WA-001` with a focused acceptance pass.

---

## 1. Task Posture

### 1.1 Official status from `ai-status.json`

| Field          | Value                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ID             | `WA-001`                                                                                                                 |
| Title          | platform_presence backend module                                                                                         |
| Summary        | 建立 per-platform online/offline、token expiry、re-auth、platform eligibility 的後端 domain module，含 migration V0014。 |
| Phase          | Wave A                                                                                                                   |
| Owner          | Qwen                                                                                                                     |
| Reviewer       | Claude                                                                                                                   |
| Status         | `done`                                                                                                                   |
| Commit Hash    | `8d33714`                                                                                                                |
| Commit Subject | `feat(wa-002): platform earnings backend module (includes WA-001 platform_presence)`                                     |
| Review Fix     | `1d32310` (missing `PlatformEarningsItem` import in `platform-earnings.service.ts`)                                      |
| Depends On     | None                                                                                                                     |

### 1.2 Recorded acceptance criteria

| Criterion                           | Status                         |
| ----------------------------------- | ------------------------------ |
| `pnpm --filter @drts/api typecheck` | PASS (recorded in parent task) |
| `pnpm test:unit`                    | PASS (recorded in parent task) |
| `pnpm --filter @drts/api lint`      | PASS (recorded in parent task) |
| API smoke: GET/POST online/offline  | PASS (recorded in parent task) |

### 1.3 Review notes from Claude (recorded in `ai-status.json`)

1. Migration SQL DEFAULT `'pending'` quoting issue was correctly fixed in commit `8d33714`.
2. `platform-earnings.service.ts` missing `PlatformEarningsItem` import caused typecheck failure; fixed in review commit `1d32310`.
3. All acceptance criteria passed: typecheck, lint, unit tests, smoke API endpoints.

---

## 2. Artifact Inventory

### 2.1 Canonical artifacts from parent task

| Artifact      | Path                                                                     | Purpose                                                                                  |
| ------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Service layer | `apps/api/src/modules/platform-presence/platform-presence.service.ts`    | Core domain logic: online/offline transitions, in-memory fallback, re-auth computation   |
| Repository    | `apps/api/src/modules/platform-presence/platform-presence.repository.ts` | DB persistence with `upsert` and `listByDriver`, optional DB with graceful fallback      |
| Controller    | `apps/api/src/modules/platform-presence/platform-presence.controller.ts` | REST endpoints: `GET /`, `POST /online`, `POST /offline` with realm auth                 |
| Module        | `apps/api/src/modules/platform-presence/platform-presence.module.ts`     | NestJS module wiring                                                                     |
| Contracts     | `packages/contracts/src/platform-presence.ts`                            | TypeScript type contracts: `PlatformPresenceRecord`, `PlatformPresenceSummary`, commands |
| Migration     | `infra/migrations/V0017__platform_presence.sql`                          | DB schema: `ops.phase1_platform_presence` table with composite PK, indexes               |

### 2.2 Cross-references in downstream tasks

| Task                                 | Relationship                                          |
| ------------------------------------ | ----------------------------------------------------- |
| `WA-002` (platform_earnings)         | Co-committed in `8d33714`; shares module lifecycle    |
| `WA-003` (Driver App multi-platform) | Depends on WA-001; consumes presence API for UI       |
| `WC-002` (Platform Presence Center)  | Depends on WA-001; driver app UI for presence toggles |
| `WC-003` (Platform Account Binding)  | Depends on WA-001; re-auth flow ties into presence    |

---

## 3. Acceptance Gate Snapshot

### 3.1 Contract correctness

| Gate                                  | Status | Evidence                                                                                              |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ | ---------- |
| Type contracts match service shapes   | `PASS` | `PlatformPresenceRecord` fields map 1:1 to DB row columns via `mapRow()` in repository                |
| Command types match controller bodies | `PASS` | `SetPlatformOnlineCommand` and `SetPlatformOfflineCommand` consumed correctly in controller `@Body()` |
| Enums are constrained correctly       | `PASS` | `PlatformPresenceStatus` = `"online"                                                                  | "offline"`, `PlatformEligibility`=`"eligible" | "ineligible" | "pending"` |
| API envelope wrapping                 | `PASS` | All 3 endpoints return `toApiSuccessEnvelope<T>()`                                                    |

### 3.2 Domain logic correctness

| Gate                                     | Status | Evidence                                                                                             |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Online transition creates/updates record | `PASS` | `setOnline()` builds full `PlatformPresenceRecord`, upserts via DB or in-memory bucket               |
| Offline transition preserves prior state | `PASS` | `setOffline()` reads existing record, preserves `eligibility`, `tokenExpiresAt`, `accountId`         |
| Re-auth computation                      | `PASS` | `computeReauthRequired()` uses 72-hour threshold window; returns `false` if no expiry set            |
| In-memory fallback                       | `PASS` | Service uses `Map<driverId, Map<platformCode, record>>` when DB unavailable; `@Optional()` injection |
| Summary endpoint                         | `PASS` | `summary()` returns `PlatformPresenceSummary` with explanatory notes                                 |

### 3.3 Database layer

| Gate                    | Status | Evidence                                                                                                             |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Migration creates table | `PASS` | `V0017__platform_presence.sql` creates `ops.phase1_platform_presence` with composite PK `(driver_id, platform_code)` |
| Column defaults correct | `PASS` | `eligibility DEFAULT 'pending'`, `reauth_required DEFAULT false`, timestamps default `NOW()`                         |
| Indexes present         | `PASS` | Indexes on `driver_id` and `platform_code` for query patterns                                                        |
| UPSERT semantics        | `PASS` | `ON CONFLICT (driver_id, platform_code) DO UPDATE` with full column coverage                                         |
| Graceful degradation    | `PASS` | Repository catches errors, logs warnings, returns empty array or passthrough record                                  |

### 3.4 Security and auth

| Gate                       | Status | Evidence                                                                                                                 |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Realm restriction          | `PASS` | All 3 endpoints use `@RequireRealms("driver", "platform", "ops")`                                                        |
| Identity resolution        | `PASS` | Controller resolves `driverId` from `identity.actorId` when `actorType === "driver_user"`, falls back to `"demo-driver"` |
| No sensitive data exposure | `PASS` | Responses contain only presence data; no secrets, tokens, or credentials exposed                                         |

### 3.5 Code quality

| Gate               | Status | Evidence                                                            |
| ------------------ | ------ | ------------------------------------------------------------------- |
| Typecheck          | `PASS` | Recorded in parent task evidence                                    |
| Lint               | `PASS` | Recorded in parent task evidence                                    |
| Unit tests         | `PASS` | Recorded in parent task evidence                                    |
| Import correctness | `PASS` | Review fix `1d32310` resolved missing `PlatformEarningsItem` import |

---

## 4. Observations and Recommendations

### 4.1 Strengths

- **Clean layered architecture**: Controller → Service → Repository → DB, with `@Optional()` injection enabling graceful in-memory fallback at every layer.
- **Correct DB mapping**: Repository `mapRow()` handles all type conversions (Date → ISO strings, enum casting) with null-safe helpers.
- **Composite PK is correct**: `(driver_id, platform_code)` matches the domain requirement of one presence record per driver per platform.
- **Re-auth threshold is reasonable**: 72-hour warning window gives drivers adequate notice before token expiry.

### 4.2 Gaps to monitor (not blockers for WA-001 closure)

| Gap                                                  | Severity   | Note                                                                                                                                             |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No dedicated unit tests for platform-presence module | `MEDIUM`   | Parent task relied on shared `pnpm test:unit` pass; no `tests/**/*platform-presence*` files exist. Consider adding focused tests in a follow-up. |
| `demo-driver` fallback in controller                 | `LOW`      | Hardcoded fallback for smoke tests is acceptable for Phase 1 but should be flagged for production hardening.                                     |
| In-memory cleanup not implemented                    | `LOW`      | `this.memory` Map grows without eviction. Acceptable for Phase 1 (runtime-only), but should be documented or bounded.                            |
| Migration version discrepancy                        | `COSMETIC` | Task brief says "V0014" but actual migration is `V0017__platform_presence.sql`. Summary in `ai-status.json` should be updated for accuracy.      |

### 4.3 Migration version note

The task summary mentions "migration V0014" but the actual file is `V0017__platform_presence.sql`. This is a documentation discrepancy, not a functional issue. The migration itself is correct and was applied as part of the parent commit.

---

## 5. Verdict

**WA-001 sidecar acceptance: `PASS`**

The platform_presence backend module meets all recorded acceptance criteria:

- Typecheck, lint, and unit tests pass
- API endpoints are correctly implemented with proper auth
- Contracts, repository, service, and controller layers are consistent
- Migration creates the correct schema with appropriate indexes and defaults
- In-memory fallback is functional and safe

The identified gaps (missing dedicated tests, in-memory cleanup, migration doc discrepancy) are tracked for follow-up but do not block closure of this sidecar acceptance packet.

---

## 6. Handoff to Codex

This packet is ready for sidecar review. The parent task `WA-001` is already `done` in `ai-status.json` with commit evidence. This sidecar pass:

1. Confirms the correctness of the existing acceptance
2. Documents a focused artifact inventory of all 6 canonical artifacts
3. Identifies 4 follow-up items (none are blockers)
4. Records the migration version discrepancy for doc cleanup

No action is required from Codex to block the parent task. This is a quality-of-record pass for the sidecar archive.
