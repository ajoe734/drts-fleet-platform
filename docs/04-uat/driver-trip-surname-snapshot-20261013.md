# DRIVER-TRIP-SURNAME-SNAPSHOT-20261013 — declared-profile completion facts

Owner **Pi**; independent reviewer **Codex**. This is an upstream source unit,
not acceptance/resumption of `PAX-RECEIPT-COMPLAINT-20261009` (Codex2/Codex).

## Authority and exact boundary

- User continuation: `繼續做完`; preserve complete Phase 1/PAX/native/role/legal
  requirements, original owners/HOLD/history, and the VM product-runtime ban.
- Latest inspected accepted source base:
  `ac9183feb65b71a3716eb4b14d070471161df643` (`origin/dev`). All five existing
  upstream fare capture/input, explicit surname API/settings and durable-profile
  save ACK tasks are DONE; none is replaced or reopened by this unit.
- Frozen spec in machine root:
  `.local/pi-continue-finish-20261013T1550/driver-trip-surname-snapshot-task-spec.json`.
  Canonical root Supervisor's 2026-10-13 16:28 note confirms the foreground Pi
  worktree, frozen primitive snapshot slice and original Receipt HOLD. No
  duplicate owner/reviewer/source worker or shared-dev release here.
- Product truth: `phase1_prd_detailed_v1.md` §9.8.1 (historical billing snapshots),
  `phase1_service_contracts_v1.md` §3.8 (Driver Task does not own compliance master
  truth), original Passenger SA/SD/content rules E-04 driver surname plus masked
  registration requirement, and machine-root Passenger `common.md` A9/A12.

The value is **self-declared data from the currently configured profile view**.
`driverSurnameSource="driver_profile_declared"` does NOT certify legal identity,
registration, provider verification, a fresh globally consistent PG revision, or
what the driver identity was at a backdated/offline client completion time.
`driverSurnameProfileUpdatedAt` copies the existing **whole-profile** revision
time; it is not an invented surname-verification time. Missing/invalid source
remains absent. There is no first-character/name inference or sample default.

## Production changes

1. `packages/contracts/src/index.ts`: additive primitive
   `DriverDeclaredSurnameSnapshot`; optional fields on `DriverTaskRecord`.
   **No client completion-command setter** is added.
2. `RegulatoryRegistryService.getDriverDeclaredSurnameSnapshot`: read the actual
   requested driver's `DriverProfileService.findProfileForDriver` view. Require
   an explicitly present nonempty surname and existing usable revision time;
   copy the exact stored strings. No constructor/module/endpoint/profile-mutation
   or authorization change.
3. `OwnedMobilityService.completeDriverTask` and
   `finalizeDriverTaskCompletionInTransaction`: after terminal replay and state/
   fixed-price checks, capture once before asynchronous completion effects. Put
   the same primitive facts on the accepted task and certificate producer.
   Proof-pending/error/rollback do not accept a new surname snapshot.
4. `buildMultiTaxiCertificateEvent` and additive completed-event typing preserve
   the same snapshot through existing JSON persistence and completion outbox.
   Strings need no nested-object clone policy; existing task cloning and public
   event DTO separation retain immutable stored/get/replay values.

No changes to Receipt consumer/writer/renderer/PDF/download, original Receipt
branch or candidate, SDK/native/settings/trip UI, registry credentials, schema,
workflow, providers, IAM, pricing/payment/toll convention, capacity or complete
`e04Snapshot`. Old certificate phone defaults are not repaired or certified by
this slice; original Receipt must still supply correct authoritative facts.

## Finding-level verification

| Finding/invariant                                                            | Actual source path                                                                                                                    | Old source → repair                                                                                                                                                                                                                                             | Limits                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SURNAME-SNAPSHOT-001`: configured surname lost at completion                | Real Profile save/read → real Registry → public order/dispatch/accept/depart/arrive/start/complete → actual task/certificate producer | Exact ac918: **2 genuine assertion failures**, **2 passing legacy controls**. Repaired source retains compound/Latin/Unicode values and provenance.                                                                                                             | Old run selected 4 cases; 18 unselected cases are NOT credited.                                              |
| `SURNAME-SNAPSHOT-002`: historical facts must not follow later profile edits | Actual get/list/request replay, actual repository serialization, existing outbox and public task event stream                         | Tests update Profile through its real awaited save, mutate returned/getter/public-stream DTOs and execute actual persisted effects; original task/outbox/replay facts remain. Legacy terminal replay does not acquire a newly configured surname.               | In-process production behavior with simulated external transports, not remote mutation or hosted acceptance. |
| Absence/source isolation                                                     | Existing Profile getters and completion producer                                                                                      | Legacy full name/unknown requested profile/foreign profile/spoofed extra completion-body surname do not fabricate facts. Malformed stored surname/revision yields absence. Legacy actual-fare omission remains absent independently of genuine surname capture. | No new security mechanism, legal verification or role-policy claim.                                          |
| Await/proof/transaction correctness                                          | Actual `OwnedMobilityRepository`, proof guards and completion pipeline                                                                | Profile changes while real repository SQL awaits cannot split task/event facts; real repository COMMIT rejection causes rollback/no completion; proof-pending gets fresh facts only after successful proof.                                                     | SQL transport simulates storage and faults; PG locking/constraints/concurrency are NOT proven.               |
| Existing behavior                                                            | Affected root/API suites                                                                                                              | Actual fare, fixed-price, proof, task replay/events, profile ACK/alias queue and registry/repository regressions stay green.                                                                                                                                    | Selected regressions only, not entire platform/genuine journeys.                                             |

### External fixture boundary

The dedicated test instantiates **real** `DriverProfileRepository`,
`DriverProfileService`, `RegulatoryRegistryService`, `OwnedMobilityRepository`,
`OwnedMobilityService`, task-events and audit code. Only database query/client
transport and event emitter delivery are fixtures. Actual repository SQL and
serialized JSON are observed; no copied completion/surname/replay business
function, fabricated schema or SQL is substituted. The fixture is NOT PostgreSQL.
Automatic hosted lease/recovery is not simulated as success: captured persisted
outbox effects are explicitly passed to the actual production effect executor.

## Completed local checks

All commands use the locked task worktree; unit runs explicitly use
`NODE_ENV=test`. No product/API/PG/HTTP/browser/Metro/preview/Docker server started.

Machine-specific raw logs/JSON:
`.local/pi-continue-finish-20261013T1550/` in canonical machine root.

- Dedicated final file: **39 focused cases**, included in the root total below.
- `surname-final-root.json`: **300 passed / 0 failed / 0 skipped** across new
  snapshot, actual-fare capture, explicit-surname capture, durable-profile ACK,
  Owned Mobility, Profile and Registry suites.
- `surname-final-api.json`: **192 passed / 0 failed / 0 skipped** across Owned
  Mobility service/repository/task events/durable sinks, Profile and Registry
  service/repository suites.
- Unique selected root + API total: **492 passed / 0 failed / 0 skipped**.
  Do **not** add the focused subset or earlier runs again.
- `@drts/contracts`, `@drts/control-plane`, `@drts/control-plane-auth` builds,
  API typecheck, scoped ESLint/Prettier and diff checks: exit 0.
- Actual commands: root `pnpm exec vitest run` with named affected paths; API
  `pnpm --filter @drts/api exec vitest run` with named affected paths;
  `pnpm --filter @drts/api typecheck`; scoped `pnpm exec eslint`/`prettier`.

Preserved failures, **not** successes:

- First two old-source runs had one genuine in-memory assertion failure plus
  two SQL-fixture setup failures. The corrected `surname-ac918-baseline-final`
  is the qualifying old-source run: two genuine failures/two passing controls.
- `api-typecheck.log` initially failed because the fresh offline worktree had not
  built `@drts/control-plane-auth`. No compiler/import/source was weakened;
  normal dependency build and `api-typecheck-final`/`-candidate` genuinely pass.

## Delivery and remaining gates

Candidate SHA/tree/branch/PR and exact remote equivalence are recorded by the
normal owner handoff and machine-root candidate evidence, not inferred from
this document. Literal task subject plus `Task-ID`, `LLM-Agent: Pi`,
`Reviewer: Codex` trailers; no bypass, amend/rebase/force or published ref rewrite.
Independent exact-SHA/generation Codex review, matching required hosted CI and
protected normal integration are still required before source DONE.

This adds NO evidence to the original genuine Receipt/download/complaint or
full-system acceptance keys and does not resume the held original owner.
Still open: original downstream adoption/HOLD/source-history disposition,
authoritative lawful fleet issuer and masked registration/legal identity,
captured payment method and aggregate/toll convention, real producer → writer
→ HTML/PDF/download/complaint evidence, original PG/browser/role/native/provider
requirements, mail approval/Ops/DNS/manual inputs and final QA integration.
Android **and** iOS stay in scope. Final system acceptance fields remain empty.
Source DONE would not be deployment; source ac918 shared-dev deployment credit
belongs to the existing original release coordinator, not this new candidate.
