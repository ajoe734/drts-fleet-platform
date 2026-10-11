# PAX-RECEIPT-COMPLAINT-20261009 — source checkpoint and remaining gates

Owner: Codex2. Independent reviewer: Codex. Updated: 2026-10-11 UTC.

**Incomplete implementation; no candidate handoff, review approval, merge or acceptance.**
The original task and both acceptance keys remain. This artifact is the original
task's finding/evidence record, not a replacement task or acceptance waiver.

## Initial intake checkpoint: authority and execution identity

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

## Initial intake checkpoint: independently verifiable unit

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

## Initial intake checkpoint: findings and original acceptance evidence

| Finding / acceptance                                    | Source and modification                                                                                                                                                                     | Old → checkpoint result                                                                                                                                                                                                                                        | Command/version/evidence                                                                                                                                                                                           | Unverified / limit                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake / lost property                                  | New passenger complaint controller/service; existing ComplaintService/Repository; V0114                                                                                                     | Base had no passenger intake endpoint (new feature, not a reproduced old behavior defect). Checkpoint creates a canonical CRM case and timeline, visible through real same-process Ops controller; restart reloads via actual `ComplaintRepository.loadState`. | Final focused suite: 38 passed, exit 0; `tests/unit/pax-receipt-complaint-20261009/complaint-intake.test.ts`; `.local/pax-receipt-complaint-20261009/intake-final.log`.                                            | Transport/migration/PG and cross-replica live Ops retrieval remain pending. SQL/account/quote/audit/event edges are fixtures; Booking, MultiTaxi ownership, intake normalization, CRM repository and Ops controller logic are real. |
| True owner, category, consent, retry, failure           | `PassengerBookingService.getRide`, `normalizePassengerComplaintIntake`, `persistPassengerIntake`                                                                                            | Positive legal intake and foreign/unknown/malformed/changed ownership/wrong identity/nonactive account negatives pass. Changed retry content/category/consent rejects; storage failures publish no case; lost COMMIT reply retries one original case.          | Same focused suite; injected SQL case/timeline/intake/connect/commit/rollback failures.                                                                                                                            | Advisory lock issued by production code, not simulated PG concurrency. Revoked/deleted-session HTTP checks require hosted QA; current guard is unchanged.                                                                           |
| `pax-receipt_e04_fields_and_passenger_download` / F-E04 | Actual `OwnedMobilityService.buildMultiTaxiCertificateEvent` → `CertificateSupportService.writeCompletedTrip/getArtifact` → `certificate-artifact.renderer.ts`; actual files outside scopes | Base and checkpoint producer/renderer source is unchanged. Re-runnable probe reaches actual producer, writer and HTML/PDF output, reports missing E-04 fields and wrong phone default. **FAIL, not accepted.**                                                 | `pnpm --filter @drts/api build` exit 0; `node tests/unit/pax-receipt-complaint-20261009/e04-source-probe.mjs` exit 2 (`E04_REQUIREMENTS_UNMET`); `.local/pax-receipt-complaint-20261009/e04-source-gap-final.log`. | Registry/SQL/phone configuration are fixtures; no real trip/issuer/fare/PSP witness. Account/token HTML/PDF downloads remain unavailable.                                                                                           |
| F-LOW-RATING / `pax-complaint_intake_and_low_rating`    | `PassengerBookingController.rateRide`, `MultiTaxiService.submitTrustedPassengerRating`, `MultiTaxiRepository.persistPassengerRating`                                                        | Direct intake unit works; actual rating controller still drops `contactRequested`, and rating repository independently commits without a complaint/consent hook. **Unfixed, not accepted.**                                                                    | Exact static call/transaction inspection on base/checkpoint; Booking regression retains original behavior.                                                                                                         | Need coordinated rating transaction seam; ≤2 + opt-in, no-opt-in, immutable consent, retries/storage failure, paid/completed/24-hour and ≤200-comment regressions are still required. No fake post-rating creation is substituted.  |
| F-OPS-REPLICA                                           | `ComplaintService.onModuleInit/listComplaintCases/getComplaintCase`, actual Ops controller                                                                                                  | Same-process/restart positives verified. Existing live replicas retain startup-only memory; another Cloud Run process may not see new intake. **Unfixed.**                                                                                                     | Exact static read path; focused restart case calls actual loadState with SQL fixtures.                                                                                                                             | Coordinate narrow source retrieval in existing complaint module, preserving statuses/timelines and other sources. No cross-replica acceptance claim.                                                                                |
| F-AUDIT-ACTOR                                           | `packages/contracts/src/index.ts:AuditLogRecord.actorType`                                                                                                                                  | Adding honest first_party_passenger central audit exposed an actual type mismatch; removed the unsupported central-audit call so source compiles. Original actor is durably retained in V0114, but central audit integration is **pending**.                   | Initial API typecheck exit 2; corrected checkpoint API typecheck/build exit 0. No cast/any or forged system/tenant identity used.                                                                                  | Supervisor must coordinate append-only actor contract scope before central passenger audit integration.                                                                                                                             |
| Prior paths and integrated regression                   | Existing certificate service and Booking/complaint production paths                                                                                                                         | Source/API regression checks pass; backend platform certificate route metadata and source remain unchanged.                                                                                                                                                    | Root affected suite 208 passed (includes first 37 intake cases), API suite 44 passed; exits 0 and finished/read. See command table below.                                                                          | Scoped tests are not full CI, platform HTTP/browser or external acceptance.                                                                                                                                                         |

### E-04 thirteen-field mapping at the initial intake checkpoint

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

## Initial Supervisor scope/seam request (resolution below)

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

## Initial intake checkpoint commands and evidence limits

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

## Same original task: registered certificate scope supplement

While this owner was still running, Supervisor registered
`.local/continue-completion-frontier-20261011T0710Z/PAX-RECEIPT-EXACT-ACTUAL-CERTIFICATE-PRODUCER-SEAM-SUPPLEMENT.md`
(SHA-256 `1c7233ec54f95280223eba69645f4365b3b8f1fa47a18c2bf345d457ea791c87`)
and appended the actual certificate/event/token adapter files and
`packages/contracts/src/passenger-app.ts` to this task. The full supplement was
read before changing those files. The original owner/reviewer, task/branch,
thirteen fields, keys and environment/actual-source restrictions remain binding.

Published source checkpoint:
`abf5e684cf4464fa0f36d0dcf534d53a651f060a`. Retains both earlier checkpoints;
no rebase/amend/reset/force. Remote dev advanced only with unrelated web auth
PR #2554 (`2f6ec0ccbb7f102a99052fc7a08995056ebb1ea4`); fetch/PR/source-diff inspection
showed no overlap in these receipt source files. No candidate was locked or
rewritten because trunk advanced.

### Implemented within the supplement

- `OwnedMobilityMultiTaxiTripCompletedEvent` now has an optional typed captured
  `CertificateE04Snapshot`. `writeCompletedTrip` persists only a validated supplied
  snapshot and rejects incomplete/unmasked capture before SQL. Missing upstream
  capture is still missing; the producer does not synthesize one from quotes,
  driver display names, current authorization identity or payment token intent.
- The private service phone default used only by
  `buildMultiTaxiCertificateEvent` changes from 0800-090-000 to 02-2944-0985.
  The actual producer/event/fare/toll/time/currency/fixed-fare/emission logic is
  otherwise unchanged. A conflicting configured phone makes passenger E-04
  unavailable rather than silently rewriting saved history.
- `CertificateSupportService.getPassengerView/getPassengerArtifact` validate the
  authorized order against the canonical certificate row and require all original
  artifact blockers plus captured operator/surname/masked registration/four actual
  fare components/payment method and canonical service phone. Missing numeric
  fields return blockers; no zero default is saved or rendered as a captured fact.
- The existing HTML/PDF renderer emits all thirteen-field labels/values for a
  complete capture, escapes HTML/XML and preserves masked credentials. Minor
  units display with two decimal places for captured E-04; legacy output retains
  its original rows/format. No new renderer or format/provider dependency is added.
- `CertificateSupportModule` exports the existing service; `MultiTaxiModule`
  imports that same module. Its existing platform controller, writer listener,
  repository, regeneration, versions/supersession, audit and currency/state rules
  remain. The passenger module only appends the receipt controller.
- Account APIs: `GET /api/passenger-app/rides/:id/receipt/downloads` and
  `/receipt/artifacts/{html,pdf}`. Account adapters run actual Booking ownership
  first; the MultiTaxi receipt resolver also verifies the order's passenger
  subject. Existing `/receipt` metadata's receiptUrl now points to the authorized
  HTML adapter through the scoped MultiTaxi mapping; the Booking controller's
  existing receipt handler is unchanged.
- Token APIs: `GET /api/passenger-rides/:accessToken/receipt/downloads` and
  `/receipt/artifacts/{html,pdf}`. Downloads use the original digest/scope guard,
  refresh a durable token lookup to observe revocation after prior reads, and
  validate the token's subject against its own order. No certificate/order ID from
  the requester can substitute the authorized token order. Existing token metadata
  now maps to the authorized artifact URLs; existing platform URLs stay unchanged.
- Descriptors preserve `PassengerReceiptResponse.receiptUrl` and append readonly
  htmlUrl/pdfUrl/certificateId/orderId. Actual JSON is snake_case through the existing
  serializer; StreamableFile is already exempt from JSON conversion. New download
  adapters set private/no-store, no-referrer, nosniff, restrictive CSP and safe
  attachment filenames. No BFF/browser transport success is claimed.

### Updated finding-level results (previous findings retained)

| Finding / original key                                  | Previous → source checkpoint result                                                                                                                                                                                                                                                                            | Finished checks / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                   | Remaining exact gate                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-E04 / `pax-receipt_e04_fields_and_passenger_download` | Original real producer still has no captured operator/surname/actual four-component fare/payment facts. Phone default is fixed. Downstream actual writer/repository/view/HTML/PDF/authorized account-token adapters map a supplied unit capture correctly and fail closed when it is absent. **Not accepted.** | `receipt-download.test.ts`: 20 pass, exit 0, SQL/captured-event fixtures explicitly labeled; positive HTML/PDF bytes, field mapping, escaping, MIME/filename/headers, foreign ownership, unknown certificate, scope, expiry, revocation after cached read, wrong subject and DB outage negatives. `e04-source-probe.mjs`: actual producer→writer→both renders still exits 2 with E04_REQUIREMENTS_UNMET, and passenger readiness is PASSENGER_E04_NOT_READY. | A typed lawful immutable upstream capture remains unavailable. Fixtures do not satisfy the actual producer acceptance, PG, HTTP/BFF/browser or lawful issuer/provider witness. |
| New account session/download guards                     | Real production guard accepts new receipt controller routes in development/staging/production, rejects the same token after logout and rejects valid platform or missing credentials.                                                                                                                          | `receipt-auth.test.ts`: 12 pass using real JWT/account/session/BootstrapAuthGuard plus in-memory account persistence; no API server.                                                                                                                                                                                                                                                                                                                         | Deleted-account/HTTP/browser behavior still needs original hosted QA.                                                                                                          |
| Prior platform path positives                           | Existing platform rows without E-04 capture still yield original HTML/PDF bytes and route URLs; passenger downloads refuse that incomplete row.                                                                                                                                                                | Existing certificate suite 20 pass, plus new platform positive case. Same original controller/scopes are unchanged.                                                                                                                                                                                                                                                                                                                                          | Platform HTTP/backend role witness remains hosted QA.                                                                                                                          |
| F-LOW-RATING / `pax-complaint_intake_and_low_rating`    | Direct intake/lost item 38 pass. Rating hook remains unfixed: controller drops contactRequested; canonical rating transaction cannot bind consent and CRM intake atomically.                                                                                                                                   | Full affected regression after supplement: 11 files / 246 cases pass (includes 38 intake, 20 downloads, 12 new guard cases and prior Booking/CRM/certificate tests).                                                                                                                                                                                                                                                                                         | Exact MultiTaxiRepository transaction seam and original E-18 invariants; no acceptance claim.                                                                                  |
| F-OPS-REPLICA                                           | Same-process/restart CRM visibility remains verified. Live peer replicas still read startup caches.                                                                                                                                                                                                            | Actual existing retrieval/source inspection; no new fake cache witness.                                                                                                                                                                                                                                                                                                                                                                                      | Authorize narrow passenger-source Ops read refresh/repository read integration in existing module.                                                                             |
| F-AUDIT-ACTOR                                           | Passenger actor/consent remain durably attributable through V0114. Central audit integration still lacks a supported first_party_passenger actor in shared contract.                                                                                                                                           | Source typecheck/build pass without forged actor or type cast.                                                                                                                                                                                                                                                                                                                                                                                               | Append-only AuditLogRecord.actorType scope/caller coordination, not included in the ten-file supplement.                                                                       |

The supplied positive capture in the downstream unit suite is an **external unit
fixture**, not output from the actual completion producer or evidence of a real
issuer/fare/payment capture. It is deliberately separate from the actual producer
probe that remains failing. No known finding or acceptance requirement is removed.

### Exact remaining boundaries for Supervisor coordination

1. `OwnedMobilityService.buildMultiTaxiCertificateEvent` has order/task/completion
   command/proof facts only. `DriverCompleteTaskCommand` supplies aggregate fare,
   distance/duration/proof; no actual start/distance/delay/night charge capture.
   `PassengerDispatchDisclosureSnapshot` supplies displayName and a masked
   credential, without a dedicated surname or captured lawful fleet issuer name.
   The order's opaque paymentMethodTokenRef does not prove the actual settled
   payment method. Resolve the precise authoritative capture contract with the
   existing completion/registry/payment owners before extending the producer.
   Further schema/driver completion/public contracts/BFF/billing changes remain
   outside the supplement. Do not derive surname or issuer arbitrarily or split
   aggregate/quote amounts into invented actual components.
2. `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`:
   `persistPassengerRating` owns its independent BEGIN/COMMIT and lacks a consent/
   complaint transaction callback. This file is still outside scopes.
   Also `findElectronicReceipt` selects the first order row without is_current or
   deterministic version ordering, unlike the canonical certificate repository.
   A regenerated order can therefore resolve an older receipt; coordinate the
   precise current-version read hunk, preserving existing platform/history paths.
3. Original Booking edits are still limited to the rating hook. No new code has
   dropped completed/paid/24-hour/score/comment/immutability requirements; those
   original E-18 behaviors remain unresolved and must be implemented with the
   coordinated durable rating-intake seam, including explicit opt-out retry state.
4. Existing complaint scope only covers passenger creation. The actual Ops
   `listComplaintCases/getComplaintCase/getComplaintTimeline` reads process memory
   loaded onModuleInit. Approve the narrow passenger-source fresh retrieval layer
   so a live peer Cloud Run instance sees newly created canonical CRM cases.
5. `packages/contracts/src/index.ts:AuditLogRecord.actorType` still excludes
   first_party_passenger. Resolve append-only actor contract scope and affected
   consumers before central passenger audit integration.

No product runtime, DB, HTTP/browser server, real provider, cloud metadata/secret,
deployment or external acceptance workflow was started on this VM.

### Final supplement command receipts

Source execution version:
`abf5e684cf4464fa0f36d0dcf534d53a651f060a`; subsequent test/evidence edits do not
change product source. All checks below completed and their results were read.

- API build including contracts/control-plane-auth prebuilds: PASS 0.
- Existing API certificate suite: 20 PASS, exit 0;
  `.local/pax-receipt-complaint-20261009/certificate-regression-final.log`.
- Root affected regression command adds
  `tests/unit/system-remediation/sr-qa-reports-001/c098-electronic-ride-certificate.test.ts`
  to the initial affected-suite command: 246 PASS / 11 files, exit 0;
  `regression-after-supplement.log`.
- First download fixture run and root typecheck failed because the test attempted
  nonexistent StreamableFile.getBuffer. Corrected the fixture to consume the real
  getStream transport; final 20 PASS / exit 0 and root typecheck PASS 0;
  `download-final.log`, `root-typecheck-download-final.log`. This initial fixture
  failure is not a reproduced product defect or acceptance evidence.
- New scopes pass original Husky lint/format/message gates. Additional final
  scoped lint, formatting, classification, whitespace and immutable-base range
  trailer/identity/scope checks run before ordinary push/PR checkpoint publication.
- Actual producer probe remains FAIL 2. Final log:
  `e04-source-gap-after-supplement.log`; default phone now 02-2944-0985, captured
  E-04 facts still absent. Probe is a source-gap witness, not a passing test.
- Original PG/HTTP/browser/provider, same-candidate CI/review/merge and both
  required acceptance keys remain unfulfilled. No complete candidate is handed
  off; branch checkpoints/draft PR preserve source for original-owner continuation.

## 2026-10-11 第二份實際接點補充：交易、稽核與 Ops（實作 checkpoint）

完整讀取 `PAX-RECEIPT-EXACT-PERSISTED-RATING-AUDIT-OPS-SEAM-SUPPLEMENT.md`，註冊 SHA256 `0a9fbf8a2ecf16cf9d7bb163ac1be8c5e694f8d7adeab7b265144359ea5440d2`。同一原 task / Codex2 / Codex，原 immutable base62，未 candidate/handoff。補充只准 AuditLogRecord actor union、typed E04 receipt snapshot、原 persistPassengerRating 交易，以及乘客來源 Ops read；未授權 current receipt repository method 或實際上游 issuer/fare/payment/driver command。

此 checkpoint 將 account 評價交給原 MultiTaxi 評分 producer/repository，在同一 PoolClient 鎖實際 booking/account/order、確認實際 completed task 完成時間與 captured payment，保存評分、driver summary、不可變 contact consent、低分 opt-in 的原 CRM case/timeline/intake。交易成功後才發布記憶體。V0114 只追加 rating consent metadata，無改別人 migration。原 token rating / moderation 及 Booking R1–R9 非 rating 路徑維持。Ops 原 GET 路徑只改 async adapter，舊 service sync API 維持，新增乘客來源持久讀取，依 updatedAt 合併且保留尚未落盤的本地 timeline。稽核使用真實 first_party_passenger，未假造 system actor。

測試與逐欄 SQL review 尚在補充，不能聲稱通過或 acceptance。之前的 compiler/source probe 失敗与通過紀錄保留。原 completed producer 仍沒有實際 E04 capture；沒有生成假 issuer、姓氏、0 元 components 或付款方式。

### 第二份補充的逐項修復及實際界線（2026-10-11 09:44 UTC）

| 原 finding        | 此輪實際修復                                                                                                                                                                                                                                                                                                                                                      | 尚未滿足的證據／精確界線                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-LOW-RATING      | 原 account rating controller → BookingService → MultiTaxiService → 原 persistPassengerRating，同一 PoolClient 寫 rating、原 driver summary、V0114 rating_consents、≤2 且 contactRequested===true 的 CRM case/timeline/passenger intake。省略或 false 為 opt-out；高分即使 true 也無客訴。原評分與選擇 hash 不可變。legacy 已評價但無 consent 不可事後加聯繫選擇。 | 真實 PostgreSQL concurrency / constraint / recovery 與 HTTP acceptance 尚未執行。原 Booking 受保護測試檔 fixture 需精確授權更新，不能用缺失 dependency 的舊 mock 當新路徑通過。                                                                                                                                                                                                                                                                           |
| F-OPS-REPLICA     | 原 Ops GET list/get/timeline async adapter；actual repository 僅 JOIN passenger.complaints 的 keyset page／case／timeline，服務已啟動後也能讀另一實例寫入的客訴。新案號 PAX UUID namespace；其他 CRM get/timeline 保留同步 service API／原行為。不覆蓋 newer local case，timeline 依 entryId 合併保留未落盤 notes。                                               | 只證明實際讀取／合併程式在 SQL response fixture 下的行為，不是 hosted Ops browser 或 PG replica 證據。原 CRM lifecycle 非交易式 write-through 維持；未重設全 CRM。                                                                                                                                                                                                                                                                                        |
| F-AUDIT-ACTOR     | 已按精確 grant 僅在 AuditLogRecord.actorType 追加 first_party_passenger，未改 IdentityContext。乘客來源 after-commit 使用 awaited recordAuditLogAsync、固定 requestId 產生同一 audit_id；遺失 COMMIT 回覆／audit write fail retry 回到同一來源。原 actorId 與 newValuesSummary.drtsPassengerId 都源自 verified identity。                                         | compiler 實際找到 packages/contracts/src/phase2-tesla-fsd-sandbox.ts:2373 的 SandboxRegulatorCaseAccessLogRecord.actorType 未擴展；regulatory-reporting/platform-admin-regulator-cases.service.ts:127 mapper 產生 TS2322。兩檔均在 scope 外，未 cast、未偽造 system、未暗改。admin.audit*logs.actor_id 原欄位 uuid，AuditLogRepository 正規化 drts_passenger*\* 為 null；actual string identifier 保存在既有 typed new_value JSON，未偽造共用 user UUID。 |
| Typed receipt     | 只在 MultiTaxiElectronicReceiptRecord 追加 optional e04Snapshot 與 receipt-only MultiTaxiReceiptE04Snapshot；保留 legacy Partial/current public fields。                                                                                                                                                                                                          | optional 型別不是 actual captured data；未聲稱每一列完整。                                                                                                                                                                                                                                                                                                                                                                                                |
| F-E04             | 第一份補充的 writer/view/HTML/PDF/download guards 仍保留。                                                                                                                                                                                                                                                                                                        | 實際 completion 仍只有 aggregate fare，沒有 lawful fleet issuer、姓氏、actual 4 components、付款 capture／total convention；DriverCompleteTaskCommand、Driver UI／Owned completion/payment producer 未授權。既有真實 producer probe FAIL2 保留。                                                                                                                                                                                                          |
| F-CURRENT-RECEIPT | 無越界修改。                                                                                                                                                                                                                                                                                                                                                      | MultiTaxiRepository.findElectronicReceipt(orderId) 仍 SELECT \* WHERE order_id=$1 LIMIT1；multi-version migration 已移除 order unique，需 is_current/version 選擇。第二份 grant ONLY persistPassengerRating，未授權其他 repository methods。                                                                                                                                                                                                              |

### SQL／schema／argument audit（未在此 VM 執行 PG）

- V0114 rating_consents: order_id uuid → V0113 booking_histories.order_id PK(uuid)；drts_passenger_id varchar100 → V0109 accounts PK(varchar100)；rating_id varchar255 unique → V0056 ops.passenger_trip_ratings.rating_id PK(varchar255)；complaint_case_no varchar100 → passenger.complaints.case_no PK/FK CRM case；source 固定 passenger_app，request_hash 64 lowercase hex，contact_requested bool。無刪除／cascade／V0113 或 V0115 改動。
- 原評分 INSERT 11 args 的順序與 unique(order_id, passenger_subject_ref)、moderation/status 皆保留；原 summary SQL 保留，用 storedRating.driverId 作 canonical driver，未把重送時的新 assignment driver 當原 driver。
- Account hook ownership SELECT `$1=orderId uuid`, `$2=verified drtsPassengerId`，booking_histories join accounts／owned_orders.order_id=b.order_id::text；active 且 deleted_at IS NULL，FOR SHARE b,a,o。亦驗證 durable order.record.passenger.passengerId，status completed。advisory lock key 綁 order+passenger，保留原 unique。
- 新評分的 completed task SELECT `$1=orderId`, `$2=原 disclosure assignmentId/tripId`, `$3=driverId`；status completed 且 record.driverId 相符，FOR SHARE。時間讀 actual record.completedAt 與 database clock_timestamp，拒絕缺失／invalid／future／>24h。payment SELECT order_id=$1 AND status=captured FOR SHARE；不把 payment token／authorized／quote 當已付。
- Replayed persisted original rating 仍校驗 owner／active／completed 與 immutable payload／consent，允許原請求在 deadline 後或付款狀態變化後恢復 ack；無 original consent 的 legacy rating fail closed，不新造 choice。
- rating_consents SELECT `$1=orderId`, `$2=subject` FOR UPDATE；request_hash 與 rating_id 必須一致。INSERT 7 args 順序 order、actor、stored rating ID、contact、hash、stored complaint ID/null、submittedAt。case/timeline/intake 與 consent 共用原 rating PoolClient，無第二次 connect／無 COMMIT 後才 fire-and-forget 建案。low_rating 使用內部 hash namespace，乘客任意 Idempotency-Key 不可碰撞系統 rating key。
- 同一 transaction BEGIN／3s lock timeout／8s statement timeout，COMMIT ack 前無 rating/cache/case/audit 成功；失敗 ROLLBACK，rollback failure 保留原 error 並 release(true)。COMMIT 已落盤但回覆遺失由同 payload retry 讀原 source。central audit 是既有 module 的獨立 awaited append；此差異不假稱全中央 audit 與 rating 同交易。
- Ops list `$1=caseNo cursor`, `$2=500`；case 與 timeline `$1=caseNo`；所有新 Ops query 只 JOIN 已持久 passenger source，原 CRM case/timeline schema、roles/envelope/routes/SLA/status 保留。

### 這一輪 command / result / failure 分類

所有下列已啟動的本機檢查均已完成並讀取，無產品 server／PG／HTTP／browser／provider／cloud。

- `pnpm --filter @drts/contracts build`: PASS0。API typecheck 與最終 `pnpm exec tsc --noEmit`: FAIL2，最終只剩上述 real regulatory DTO actor TS2322（`root-rating-typecheck-boundary.log`）。自己的 optional consent fixture TypeScript 失敗已修正；未把 typecheck 描述為通過。
- `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009`: PASS0，110 cases / 4 files (`scoped-rating-gated-final.log`)。其中 rating 40 cases 含原 producer/controller/repository 與 actual audit repository，只有 SQL/account/completion/disclosure/clock 回應是 unit fixtures。涵蓋 opt-in off/highscore／同 payload replay／changed consent/score/comment/tags／legacy no-consent／foreign/unknown/malformed/deleted/owner changed／cancelled/unpaid/missing/future/24h deadline／200 unicode chars／rating/case/timeline/intake/consent/summary/commit/connect/rollback/audit failure／lost ack/restart/peer Ops／COMMIT pending 沒有 memory publish／existing CRM notes與nonpassenger。
- 初始 rating test FAIL1，9 failed /22 passed：測試錯把既有 bootstrap audit seed 算為乘客 audit；已只按真正 actionName 判讀，31 case 後續 PASS0。此為 fixture assertion failure，不是產品 transaction 故障，原 log `rating-transaction-initial.log` 保留。
- 完整 root affected regression (`regression-rating-final.log`): FAIL1，282 passed /4 failed /12 files。四個失敗皆來自 scope 外 `tests/unit/pax-booking-history-20261009/booking-access.test.ts`：兩個 identity literals 沒 actorType，三個 rate ownership negatives 因 invalid identity 401 而未達預期404；單一舊 rating mapping mock positive 缺 ComplaintService/hook（舊欄 body rideId ignored 保留）。先前 run 在 actor guard 前為276 passed/1 failed，保留兩次結果。已透過官方 progress 報精確同檔 identity+rating delegation fixture 更新範圍，未偷改原 accepted Booking test。
- `pnpm --filter @drts/api exec vitest run` 八個 actual multi-taxi authority/repository/controller/service/rating read、complaint taxonomy/escalation、certificate suites：PASS0，106 cases /8 files (`api-affected-rating.log`)。原 token-rating／moderation／legacy certificate positives 保持。
- Scoped eslint PASS0 (`rating-lint-final.log`)；diff whitespace PASS0。原 Husky 會 format 整個 staged repository；初始 AST printer 對5個舊方法產生純格式 false differences，改用真正 structural TypeScript AST（包含 literal SQL），除 persistPassengerRating 外50個既有 class members 全部相同 (`repository-scope-review.json`)。沒有 Payment／notification 方法語意改動。
- 新 anchor 首次 commit 使用 lowercase codex2 trailer 被精確 hook deny；修正實際 `LLM-Agent: Codex2` 與 Codex reviewer 後，原 Husky／message guard 正常通過，未 bypass、amend、reset 或 force。checkpoint `410ca2889de126f449d4b436d08b1350994d610d` 已普通 push。
- PR2556 仍 draft、未 handoff。舊 c731 exact SHA GitHub CI38128075143 完成SUCCESS，已讀每個 job；draft ci-integ 非完整產品 gate。新410c CI38128856349 完成FAILURE，已讀 failed log：此初期 source anchor 同時包含 regulatory actor TS2322 與自有 intake test async adapter 未 await TS2339。後者已由此輪 owner scoped test 修正；前者仍待精確 scope。Draft ci-integ38128856324 success 但 unit/typecheck/build skipped，不能當 full candidate CI evidence。一次 read-only查錯run ID為404，後續從 actual checks link 取得正確 run，未推論結果。

沒有 candidate/CI 通過宣告／獨立 review／protected merge／兩個 acceptance keys。本頁前面的未授權 finding 為當時歷史；本節列出補充後現況。PG/HTTP/Android+iOS/browser/provider/legal issuer witness 繼續受原 shared QA 及 VM restriction gates。下一步只在原 task 精確授權上述 boundary；不建新 helper task／新 manual worker，不部署或改 supervisor product source。
