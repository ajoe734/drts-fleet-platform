# PAX-RECEIPT-COMPLAINT-20261009 — source checkpoint and remaining gates

Owner: Codex2. Independent reviewer: Codex. Updated: 2026-10-11 UTC.

**Incomplete implementation; no candidate handoff, review approval, merge or acceptance.**
The original task and both acceptance keys remain. This artifact is the original
task's finding/evidence record, not a replacement task or acceptance waiver.

## Authority and execution identity

- Read `AI_COLLABORATION_GUIDE.md`, including §0.7, the full original
  `.local/passenger-app-20261009/{common.md,PAX-RECEIPT-COMPLAINT-20261009.md}`
  from the canonical machine root, and the registered
  `.local/continue-completion-frontier-20261011T0710Z/PAX-RECEIPT-ORIGINAL-SOURCE-AFTER-REAL-BOOKING-DELIVERY.md`.
- Product authority: `docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md`,
  `02_content_and_rules.md` (E-04 thirteen fields; E-18b ≤2 and explicit contact),
  and V0114 allocation in `docs/04-uat/system-remediation-20260906/schema-allocation.json`.
  Complaint ownership remains Complaint Service per `phase1_service_contracts_v1.md`
  §3.10; PRD §5.2 and SC-027 require a real case and timeline.
- Worktree:
  `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-pax-receipt-complaint-20261009`.
  Branch: `codex2/pax-receipt-complaint-20261009`.
- Immutable delivered Booking base:
  `62a73710e87c0163c7e82a5956612be558e554bf`. Fetch/remote inspection confirmed
  `origin/dev` at that SHA and no pre-existing receipt branch/PR. Booking source
  dependency is satisfied; Booking external acceptance is not implied.
- First additive source checkpoint:
  `ae81074f47e69247fc2e3b3c494edfcbcee48c78`, normally pushed to the expected branch.
  Later test/evidence checkpoints retain this published commit, without rewriting
  history. The final checkpoint/PR identity is recorded by the release status CLI.
- All durable commit subjects start literally `PAX-RECEIPT-COMPLAINT-20261009:`
  and carry `LLM-Agent: Codex2`, `Task-ID: PAX-RECEIPT-COMPLAINT-20261009`,
  `Reviewer: Codex`. The configured task message guard and original Husky chain
  run; no bypass variables or hook/config overrides are used.
- This worktree initially linked dependencies to the canonical root, including
  `@drts/contracts` pointing into the Booking worktree. Only this worktree's
  dependency symlinks were unlinked; `pnpm install --offline --frozen-lockfile
--ignore-scripts` installed isolated dependencies (exit 0, no lockfile change).
  Missing ignored `.husky/_` runtime shims were copied from the existing canonical
  Husky installation while preserving the configured task guard path. Root
  dependency links were not changed. This setup is not product evidence.

## Implemented independently verifiable unit

`PassengerComplaintController.create` publishes
`POST /api/passenger-app/rides/:id/complaints` with passenger realm metadata.
It derives the account ID from the verified request identity, uses the canonical
`CreatePassengerComplaintCommand` / `CreatePassengerComplaintResponse`, and
requires a bounded `Idempotency-Key` header. `rideId` must match the route.

`PassengerComplaintService.create` first calls the delivered
`PassengerBookingService.getRide`, including `PassengerBookingRepository` ownership
and `MultiTaxiService.getPassengerRideById`. It then delegates to the existing
`ComplaintService.createPassengerComplaintCase`; no replacement case store is used.

`normalizePassengerComplaintIntake` validates service/fare/lost_item/other,
explicit boolean contact consent, nonblank content (≤2000 Unicode code points),
and lost item details (required only for lost_item; ≤1000). It copies only the
canonical allowed fields, excluding caller-supplied actor/tenant/severity/source.
The current header limit is 255 Unicode code points.

`ComplaintRepository.persistPassengerIntake` commits CRM case, CRM creation
timeline and V0114 source/actor/consent/idempotency metadata in one transaction.
The transaction locks an owned Booking row and an active, undeleted account
using `FOR SHARE OF b, a`. An account-scoped advisory lock and unique key guard
retries. Same key/normalized payload returns the original case; changed payload,
ride/category or consent returns 409. Insert/commit failures propagate; unsuccessful
connections are rolled back and evicted, including a lost COMMIT response.

Only after a confirmed commit does the service publish the case into the
existing same-process Ops authority. CRM category mapping is service →
driver_service, fare → fare_dispute, lost_item → lost_and_found, other → other;
existing SLA rules apply. `caseSource` uses the actual allowed value `app`, with
explicit passenger App source and contact choice in the case/timeline. The
passenger account ID remains in the intake metadata, without copying account
phone/email/name into the case. No contact provider is called.

V0114 contains only intake metadata; content/lost item description remains in
the existing CRM case. Its foreign keys preserve existing account, Booking and
CRM relationships, with no cascades or history deletion. Existing Booking,
Facebook, OAuth, auth policy and payment seams are unchanged; the passenger
module only appends the complaint module import, controller and provider.

## Formal SQL/schema comparison

| Production query/write | Formal schema and exact mapping                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ownership lock         | V0113 `passenger.booking_histories.order_id uuid`, `drts_passenger_id varchar(100)`; V0109 `passenger.accounts.drts_passenger_id`, `status`, `deleted_at`. Predicates bind `$1=orderId`, `$2=authenticated passengerId`, with active/undeleted status. |
| CRM case               | V0011 `crm.phase1_complaint_cases(case_no,status,sla_due_at,created_at,updated_at,record)` → six ordered values, `record::jsonb`. Uses the existing runtime repository's real table, not V0007's separate legacy table.                                |
| CRM timeline           | V0011 `crm.phase1_complaint_timelines(entry_id,case_no,action,created_at,record)` → five ordered values, `record::jsonb`; action `case_created`.                                                                                                       |
| Intake                 | Allocated V0114 `passenger.complaints(case_no,drts_passenger_id,order_id,category,contact_consent,idempotency_key_hash,request_hash,created_at)` → eight ordered values. Source defaults/checks to passenger_app; hashes are SHA-256 hex.              |
| Replay read            | Join V0114 metadata to actual CRM case and creation timeline, filtered by authenticated account and key digest; compare normalized command digest before returning.                                                                                    |

This is a static column/type/predicate/argument comparison. SQL mocks do not
prove migration application, actual PG locking, constraints or concurrent retries.

## Findings and original acceptance evidence

| Finding / acceptance                                    | Source and modification                                                                                                                                                                     | Old → checkpoint result                                                                                                                                                                                                                                        | Command/version/evidence                                                                                                                                                                                           | Unverified / limit                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake / lost property                                  | New passenger complaint controller/service; existing ComplaintService/Repository; V0114                                                                                                     | Base had no passenger intake endpoint (new feature, not a reproduced old behavior defect). Checkpoint creates a canonical CRM case and timeline, visible through real same-process Ops controller; restart reloads via actual `ComplaintRepository.loadState`. | Final focused suite: 38 passed, exit 0; `tests/unit/pax-receipt-complaint-20261009/complaint-intake.test.ts`; `.local/pax-receipt-complaint-20261009/intake-final.log`.                                            | Transport/migration/PG and cross-replica live Ops retrieval remain pending. SQL/account/quote/audit/event edges are fixtures; Booking, MultiTaxi ownership, intake normalization, CRM repository and Ops controller logic are real. |
| True owner, category, consent, retry, failure           | `PassengerBookingService.getRide`, `normalizePassengerComplaintIntake`, `persistPassengerIntake`                                                                                            | Positive legal intake and foreign/unknown/malformed/changed ownership/wrong identity/nonactive account negatives pass. Changed retry content/category/consent rejects; storage failures publish no case; lost COMMIT reply retries one original case.          | Same focused suite; injected SQL case/timeline/intake/connect/commit/rollback failures.                                                                                                                            | Advisory lock issued by production code, not simulated PG concurrency. Revoked/deleted-session HTTP checks require hosted QA; current guard is unchanged.                                                                           |
| `pax-receipt_e04_fields_and_passenger_download` / F-E04 | Actual `OwnedMobilityService.buildMultiTaxiCertificateEvent` → `CertificateSupportService.writeCompletedTrip/getArtifact` → `certificate-artifact.renderer.ts`; actual files outside scopes | Base and checkpoint producer/renderer source is unchanged. Re-runnable probe reaches actual producer, writer and HTML/PDF output, reports missing E-04 fields and wrong phone default. **FAIL, not accepted.**                                                 | `pnpm --filter @drts/api build` exit 0; `node tests/unit/pax-receipt-complaint-20261009/e04-source-probe.mjs` exit 2 (`E04_REQUIREMENTS_UNMET`); `.local/pax-receipt-complaint-20261009/e04-source-gap-final.log`. | Registry/SQL/phone configuration are fixtures; no real trip/issuer/fare/PSP witness. Account/token HTML/PDF downloads remain unavailable.                                                                                           |
| F-LOW-RATING / `pax-complaint_intake_and_low_rating`    | `PassengerBookingController.rateRide`, `MultiTaxiService.submitTrustedPassengerRating`, `MultiTaxiRepository.persistPassengerRating`                                                        | Direct intake unit works; actual rating controller still drops `contactRequested`, and rating repository independently commits without a complaint/consent hook. **Unfixed, not accepted.**                                                                    | Exact static call/transaction inspection on base/checkpoint; Booking regression retains original behavior.                                                                                                         | Need coordinated rating transaction seam; ≤2 + opt-in, no-opt-in, immutable consent, retries/storage failure, paid/completed/24-hour and ≤200-comment regressions are still required. No fake post-rating creation is substituted.  |
| F-OPS-REPLICA                                           | `ComplaintService.onModuleInit/listComplaintCases/getComplaintCase`, actual Ops controller                                                                                                  | Same-process/restart positives verified. Existing live replicas retain startup-only memory; another Cloud Run process may not see new intake. **Unfixed.**                                                                                                     | Exact static read path; focused restart case calls actual loadState with SQL fixtures.                                                                                                                             | Coordinate narrow source retrieval in existing complaint module, preserving statuses/timelines and other sources. No cross-replica acceptance claim.                                                                                |
| F-AUDIT-ACTOR                                           | `packages/contracts/src/index.ts:AuditLogRecord.actorType`                                                                                                                                  | Adding honest first_party_passenger central audit exposed an actual type mismatch; removed the unsupported central-audit call so source compiles. Original actor is durably retained in V0114, but central audit integration is **pending**.                   | Initial API typecheck exit 2; corrected checkpoint API typecheck/build exit 0. No cast/any or forged system/tenant identity used.                                                                                  | Supervisor must coordinate append-only actor contract scope before central passenger audit integration.                                                                                                                             |
| Prior paths and integrated regression                   | Existing certificate service and Booking/complaint production paths                                                                                                                         | Source/API regression checks pass; backend platform certificate route metadata and source remain unchanged.                                                                                                                                                    | Root affected suite 208 passed (includes first 37 intake cases), API suite 44 passed; exits 0 and finished/read. See command table below.                                                                          | Scoped tests are not full CI, platform HTTP/browser or external acceptance.                                                                                                                                                         |

### E-04 thirteen-field mapping (still incomplete)

| Canonical E-04 field                   | Existing actual source / current gap                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Fleet/dispatcher                     | Completion event and immutable receipt record lack issuer/fleet display identity. Cannot infer one from a current authorization ID.                                          |
| 2 Plate                                | `buildMultiTaxiCertificateEvent` registry lookup → plateNo → writer/view/renderer.                                                                                           |
| 3 Driver surname + masked registration | Assignment disclosure has `driver.displayName` / `registrationMaskedDisplay`; completion event and receipt do not carry them. Never read/expose the raw registration number. |
| 4 Pickup/dropoff times                 | Actual task startedAt / completedAt → pickupAt/dropoffAt.                                                                                                                    |
| 5 Origin/destination                   | Order pickup/dropoff address → routeSummary; no additional invented locations.                                                                                               |
| 6 Distance                             | Completion actualDistanceKm → distanceMeters.                                                                                                                                |
| 7 Duration                             | Completion actualDurationSec → travelDurationSeconds.                                                                                                                        |
| 8 Fare components                      | Only one fare amount reaches the event. No authoritative actual start/distance/delay/night component snapshot; quote estimates cannot replace it.                            |
| 9 Toll                                 | Completion expenseItems of type toll → tollMinor.                                                                                                                            |
| 10 Total                               | Existing amountMinor renders 車資, without an explicit agreed fare/toll total convention. Coordinate actual settlement/payment source; do not invent/sum ambiguous amounts.  |
| 11 Payment method                      | Receipt/event lack an immutable method display snapshot. Preserve separately owned payment seam.                                                                             |
| 12 Service phone                       | Actual producer default is still 0800-090-000; canonical content requires 02-2944-0985.                                                                                      |
| 13 Authority complaint phone           | Actual event configurable authorityComplaintPhone; preserve lawful configured value, not a guessed regulator.                                                                |

## Exact Supervisor scope/seam request

The specified `apps/api/src/modules/multi-taxi/certificate-support.*` files do
not exist. Do not copy a second generator into that path. Under Guide §0.7,
coordinate original task leases and append-only contracts for these actual layers:

1. `apps/api/src/modules/certificate-support/certificate-support.{service,types,module}.ts`
   and `certificate-artifact.renderer.ts`: existing canonical writer/view/renderer
   E-04 mapping; export the existing authority to passenger download entry without
   creating a second completion listener or relaxing platform route guards.
2. `apps/api/src/modules/owned-mobility/owned-mobility-events.ts` and only
   `OwnedMobilityService.buildMultiTaxiCertificateEvent` / its completion callers
   in `owned-mobility.service.ts`: immutable issuer/assignment/actual fare/payment
   source mapping and correct phone default. First resolve the precise actual
   fare-component producer and payment snapshot with their existing owners;
   `DriverCompleteTaskCommand` currently supplies aggregate fare only.
3. `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` (`MultiTaxiElectronicReceiptRecord`),
   `packages/contracts/src/passenger-app.ts` (`PassengerReceiptResponse`), and
   `packages/contracts/src/index.ts` (`AuditLogRecord.actorType`): preserve existing
   consumers while appending real typed receipt fields/download responses and
   passenger audit actor. No ad hoc fake DTO or `any` workaround.
4. `apps/api/src/modules/multi-taxi/multi-taxi.{controller,service}.ts`:
   token HTML/PDF entry must consume the real receipt:read token guard (unknown,
   expired/revoked/wrong scope negatives) and reuse the canonical artifact authority.
   Existing platform certificate controller/routes retain their guards and paths.
5. `MultiTaxiRepository.persistPassengerRating` and the corresponding service
   caller in `apps/api/src/modules/multi-taxi/`: coordinate a transaction or durable
   intake hook that binds the original persisted rating and explicit contact
   choice once. The allocated passenger metadata may evolve within V0114 while
   unpublished as a migration; no standalone post-rating fire-and-forget case.
   Booking writes remain limited to the rating hook; preserve accepted Booking
   R1–R9 and the separately owned Payment guard seam.
6. Within the already scoped complaint module, authorize the narrowly required
   Ops retrieval layer for passenger-source cases across live replicas, rather
   than leaving only the creation layer's same-process cache publication.

No Supervisor/tooling/CI/deploy source change, extra task/helper, manual worker,
VM runtime, real provider call, external account or secret operation is requested.

## Completed commands and evidence limits

All commands ran in the assigned worktree; Node v22.23.2, pnpm 10.33.0,
TypeScript 5.9.3, Vitest 4.1.4. Product source version is the full checkpoint
`ae81074f47e69247fc2e3b3c494edfcbcee48c78`; later modifications only add tests/probe
and this artifact. No checks are left running at owner yield.

| Command                                                                                                                                                                                                                 | Finished result / evidence                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build` + `pnpm --filter @drts/control-plane-auth build`                                                                                                                                  | PASS, exit 0; isolated local package outputs.                                                                                                                   |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                     | Initial FAIL 2 on unsupported central audit actor; unsupported call removed. Final PASS 0.                                                                      |
| `pnpm --filter @drts/api build`                                                                                                                                                                                         | PASS 0, including dependency prebuilds.                                                                                                                         |
| `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/complaint-intake.test.ts`                                                                                                                               | PASS 0, final 38 cases; `intake-final.log`.                                                                                                                     |
| `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009 tests/unit/pax-booking-history-20261009 tests/unit/complaint.test.ts tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts` | PASS 0, 8 files / 208 cases before adding the restart-only case; `regression.log`.                                                                              |
| `pnpm --dir apps/api exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts tests/unit/certificate-support.service.test.ts`                                  | PASS 0, 3 files / 44 cases; `api-regression.log`.                                                                                                               |
| `pnpm typecheck:root`                                                                                                                                                                                                   | Initial FAIL 2 on four test indexed-access types; fixed nonnull indexes after length assertions. Final PASS 0; `root-typecheck-final.log`.                      |
| Scoped ESLint `--max-warnings=0` + Prettier                                                                                                                                                                             | Initial probe lint FAIL 1 for CommonJS requires; converted probe to native ESM. Final PASS 0; `lint-final.log`; original Husky also checks staged source/tests. |
| `node tests/unit/pax-receipt-complaint-20261009/e04-source-probe.mjs`                                                                                                                                                   | **FAIL 2, meaningful E04_REQUIREMENTS_UNMET**, not a package/fixture failure. `e04-source-gap-final.log`; actual producer/writer/HTML/PDF still incomplete.     |
| `git diff --check`, full base→HEAD trailer/scope/classification guards                                                                                                                                                  | Run for each checkpoint; publication receipts recorded in status/PR.                                                                                            |
| PG, API/HTTP, browser, contracted issuer/fare/provider witness and both acceptance keys                                                                                                                                 | NOT RUN / NOT ACCEPTED. Must use original authorized hosted QA; none was started on this VM.                                                                    |
| Same candidate CI/review/merge                                                                                                                                                                                          | NOT APPLICABLE YET: no complete candidate. Draft PR/checkpoints preserve recoverable source only.                                                               |

Machine-specific command logs are under this worktree's `.local/pax-receipt-complaint-20261009/`.
The probe and test are tracked, so the checks can be rerun without those logs.
No earlier Booking green CI or platform-only renderer test is treated as receipt
CI, passenger download acceptance or complete E-04 coverage.
