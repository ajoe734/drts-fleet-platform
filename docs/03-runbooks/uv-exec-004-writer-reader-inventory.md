# UV-EXEC-004: Owned-order writer/reader inventory (SD §7.5)

Status: evidence artifact for `required_acceptance: writer_reader_inventory`.
Scope: every entry point that can read or mutate `ops.phase1_owned_orders`
through `OwnedMobilityService`/`OwnedMobilityRepository`, or through the
callcenter/multi-taxi surfaces SD §7.5 explicitly calls out as sharing the
same aggregate. This is a map for the tasks that depend on UV-EXEC-004
(UV-EXEC-005/006/013/015) to know what still needs to move onto the shared
UoW/CAS primitives added here, not a claim that this task rewired all of
them.

## What UV-EXEC-004 actually changed

- `infra/migrations/V0089__owned_order_aggregate_version.sql`: adds
  `ops.phase1_owned_orders.aggregate_version`, a `GENERATED ALWAYS ... STORED`
  column derived from `record->>'aggregateVersion'` (same convention V0088
  already used for `call_id`/`voice_intent_id`), so the column can never
  drift from the JSON snapshot that produced it.
- `OwnedMobilityRepository` (`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`):
  - `findOrderForUpdate` -- locks and returns the current row + version
    (`FOR UPDATE`, must run inside `withTransaction`).
  - `insertVoiceOrder` -- creates a new order without the legacy blind
    `ON CONFLICT DO UPDATE` upsert; a collision on `order_id` or the partial
    unique `voice_intent_id`/`call_id` indexes (V0088) raises
    `OwnedOrderDuplicateVoiceLinkError`.
  - `updateOrderWithCas` -- compare-and-swap update; a stale `expectedVersion`
    raises `OwnedOrderVersionConflictError`.
  - `withTransaction` now sets `lock_timeout='3s'` / `statement_timeout='8s'`
    for every owned-mobility transaction (existing callers included).
- `OwnedMobilityService`:
  - `resolveAuthoritativeOrder` (was `pickNewestOrder`) -- a persisted DB row
    is now always authoritative over the in-memory copy once persistence is
    enabled, instead of comparing `updatedAt` (SD §7.5 names this exact
    anti-pattern: an uncommitted in-memory mutation can carry a newer
    timestamp than the last durable commit). Used by `resolvePersistedOrder`
    / `resolvePersistedTenantBooking`.
  - `createVoiceOrder` / `commitVoiceOrderMutation` -- the new pure-prepare +
    CAS entry points: fail closed when durable storage is not configured,
    run the caller's pure `prepare` callback inside a single PoolClient
    transaction locked/CAS-protected on the order row, and only touch the
    in-memory projection (`applyAuthoritativeOrder`) after a successful
    commit. No existing entry point calls these yet -- they exist for the
    tasks below to adopt.
- `apps/api/tests/integration/uv-exec-004.integration.test.ts` -- real
  Postgres evidence: CAS blocks a stale snapshot write, a duplicate
  `voice_intent_id` insert is rejected, a failed transaction leaves the row
  byte-for-byte unchanged, and a second transaction blocked on the same row
  fails on `lock_timeout` (55P03) instead of hanging.
- `apps/api/tests/unit/owned-mobility.service.test.ts` -- mocked-repository
  coverage for the same guarantees at the service layer (fail-closed,
  no in-memory pollution on rollback/conflict, post-commit projection
  update).

None of this required touching the ~40 existing order-mutating methods
below; they still read/write through the pre-existing
`this.orders` array + `persistChanges`/`persistChangesRequired` path. That
is intentional: those methods currently only ever run against manual/driver-
created orders (no caller sets `voiceIntentId` yet), so SD §7.5's "或明確拒絕
該未開通操作" is satisfied by there being no voice caller at all yet. Wiring
each of them onto `commitVoiceOrderMutation` (or explicitly rejecting the
operation for a voice-linked order) is the job of the dependent tasks listed
next to each group.

## Inventory

### 1. Normal/multi-channel booking, primary call-order link, recording listeners

| Entry point                                                                | Location                                                     | UoW/CAS status                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createPassengerOrder`                                                     | `owned-mobility.service.ts:637`                              | Not migrated. In-memory push + `persistChanges` (fire-and-forget).                                                                                                                                                                                                                                                                                                                                                                                                             |
| `createCallCenterOrder`                                                    | `owned-mobility.service.ts:1067`                             | Not migrated. Same as above; also the writer V0088's header identifies as calling `CallcenterService.linkOrderToCallSession` as a second, unawaited, non-transactional write (see below).                                                                                                                                                                                                                                                                                      |
| `createTenantBooking`                                                      | `owned-mobility.service.ts` (business-dispatch path, ~1400s) | Partially migrated: already runs inside `ownedMobilityRepository.withTransaction` + `persistOrderWorkflow` when persistence + tenant-partner persistence are both enabled, but still mutates `order.approvalState`/governance state eagerly before the transaction and compensates with `restoreTenantGovernanceSnapshot` on failure -- the "mutate eagerly, roll back via snapshot restore" pattern this task's pure-prepare primitives are meant to replace, not yet ported. |
| `resolvePersistedOrder` / `resolvePersistedTenantBooking`                  | `owned-mobility.service.ts:~1762,~1838`                      | **Migrated in this task.** DB row now wins outright over the in-memory copy (`resolveAuthoritativeOrder`) instead of an `updatedAt` comparison.                                                                                                                                                                                                                                                                                                                                |
| `handleCallRecordingAttached`                                              | `owned-mobility.service.ts:1646`                             | Not migrated. Mutates `order` found via `this.orders.find(...)`, fire-and-forget persist.                                                                                                                                                                                                                                                                                                                                                                                      |
| `handleCallRecordingStateChanged`                                          | `owned-mobility.service.ts:1705`                             | Not migrated. Same shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CallcenterService.linkOrderToCallSession`                                 | `callcenter.service.ts:765`                                  | Not migrated; not transactional with the order write (V0088 migration header: "persists the order and the call-session link as two independent, unawaited...writes, not one transaction"). Tracked as an explicit open item for UV-EXEC-005.                                                                                                                                                                                                                                   |
| `/call-center/multi-taxi/rides`, `/callcenter/sessions/:callId/link-order` | `multi-taxi.controller.ts`                                   | Not migrated; SD §7.5 requires these to apply the same §7.4 fence as the primary call-order link. Owned by UV-EXEC-005.                                                                                                                                                                                                                                                                                                                                                        |

### 2. Dispatch/redispatch/assign/reassign, no-supply/timeout, cancel, driver lifecycle

| Entry point                                                                                                               | Location                                                           | UoW/CAS status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatchOrder`                                                                                                           | `owned-mobility.service.ts:2612`                                   | Not migrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `redispatchOrder`                                                                                                         | `owned-mobility.service.ts:2932`                                   | Not migrated (has its own optimistic `expectedAssignmentVersion` guard on the _assignment_, unrelated to the order-level `aggregateVersion` added here).                                                                                                                                                                                                                                                                                                                                                         |
| `assignDispatch`                                                                                                          | `owned-mobility.service.ts:3698`                                   | Partially migrated: already uses `ownedMobilityRepository.withTransaction` for the assignment-time re-check when persistence is enabled (see the existing `"uses repository transactions for assignment-time recheck..."` unit test), but the order row itself is still mutated in place, not through `updateOrderWithCas`.                                                                                                                                                                                      |
| `reassignDispatch`                                                                                                        | `owned-mobility.service.ts:3772`                                   | Not migrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `handleDispatchTimeout`                                                                                                   | `owned-mobility.service.ts:7145`                                   | Not migrated. SD §7.6 separately flags this exact method: "不能直接沿用 `handleDispatchTimeout(orderId)` 再尋找最新 assignment 取消" -- rework is scoped to UV-EXEC-006/016, not this task.                                                                                                                                                                                                                                                                                                                      |
| `acceptDriverTask` / `rejectDriverTask` / `departDriverTask` / `arrivedPickup` / `startDriverTask` / `completeDriverTask` | `owned-mobility.service.ts:4636` and neighboring methods to `4911` | Not migrated. All mutate `task`/`assignment`/`order` in place before calling `persistChangesRequired`; a rejected/rolled-back persist leaves the mutation in memory (the exact anti-pattern SD §7.5 names). Left alone in this task because these are the highest-traffic manual/driver paths and rewriting them was out of the bounded scope UV-EXEC-004 was reviewed for -- retrofitting them onto `commitVoiceOrderMutation` (or proving they cannot yet apply to a voice-linked order) is UV-EXEC-006's job. |
| `cancelOwnedOrder` / `cancelTenantBooking` / `cancelReferralPassengerTrip`                                                | `owned-mobility.service.ts:4109,2495,11249`                        | Not migrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 3. Manual fare, exception release, queue operations on voice orders

| Entry point                                          | Location                                                                                      | UoW/CAS status                                                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyManualFareOverride`                            | `owned-mobility.service.ts:2507`                                                              | Not migrated. No voice-order gate yet -- SD §7.5 requires the backend to reject this for a voice order until the capability is explicitly supported; not yet implemented. |
| Exception-hold create/resolve/override-request flows | `owned-mobility.service.ts` (search `exceptionHold`, e.g. `~2780`, `~3169`, `~3260`, `~3369`) | Not migrated; same open item as above.                                                                                                                                    |
| Queue-entry/queue-release operations                 | `owned-mobility.service.ts` (`QUEUE_ENTRY_POLICY_MAP` consumers)                              | Not migrated; same open item as above.                                                                                                                                    |

### 4. Callcenter recording/close/identity/ETA/callback/case-linking

| Entry point                                                                      | Location                | UoW/CAS status                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording bind/close, identity playback, ETA, callback, case-association updates | `callcenter.service.ts` | Not migrated. SD §7.5: "均不得覆掉已保存的 scope／主單／確認 refs" -- these currently have no voice-scope-awareness check at all, since no caller produces a voice-linked order yet. Owned by UV-EXEC-005. |

## Why this task did not migrate group 2-4 itself

`commitVoiceOrderMutation`/`createVoiceOrder` are generic and already handle
the "pure prepare, single PoolClient transaction, CAS on `aggregate_version`,
project only after commit, fail closed with no DB" contract SD §7.1/§7.5
require. Retrofitting every one of the ~40 call sites above in the same
change would mean rewriting the entire owned-mobility mutation surface
(dispatch, driver lifecycle, callcenter, multi-taxi) in one task, which is
exactly the risk the execution-tasks runbook splits across UV-EXEC-005
("封住 Callcenter、multi-taxi 與 callback 舊入口競態") and UV-EXEC-006
("所有派遣入口共用司機與車輛保留") -- both declared dependent on this task.
Since no caller in this repository sets `voiceIntentId` yet (verified: no
match for `voiceIntentId`/`commitVoiceBooking` outside this task's own
diff), every entry point above is, today, only ever reached for a
non-voice order, so leaving them on the pre-existing in-memory-first path
does not regress any currently-supported voice behavior -- there is none
yet to regress.
