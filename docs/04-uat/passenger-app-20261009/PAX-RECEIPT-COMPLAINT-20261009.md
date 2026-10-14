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

## 2026-10-11 exact remaining source seams（第三份補充）

本輪前兩個修復單元完成紀錄：

- Audit actor checkpoint `2d2df480e` 已普通 push；API typecheck 在 control-plane-auth dependency build 後 PASS0 (`audit-api-typecheck-final.log`)，原 mapper 不需要 runtime 修改。最終 root compiler 尚待整體回歸。
- Receipt source 唯一變更：原 `findElectronicReceipt` 增加 `AND is_current = true ORDER BY receipt_version DESC`。V0062 partial unique 決定每個 order 至多一個 current；版本排序與 formal certificate reader 一致。既有 mapElectronicReceipt 原樣回傳實際 receipt ID/record，後續正式 certificate authority 再驗證 order/state/E04 readiness；不需要新的版本或資料 fallback。
- 舊 query（product 與 cec585 完全相同）+ 最小三個追加案例：FAIL1，20 PASS / 3 FAIL (`old-current-receipt-regression-final.log`)。舊版本回傳歷史 ID，current unavailable 或無 current 時仍成功；新 query 下原 20 + 新 3 全部 PASS0 (`current-receipt-regression-final.log`)。實際 account/token resolvers、writer/repositories/HTML/PDF 與 platform history 皆執行。SQL 回應與 immutable E04 capture 是明列的外部 fixtures，未執行 PostgreSQL，不作 PG/versioning/concurrency acceptance。
- 修正版初次結果 22 PASS / 1 FAIL (`current-receipt-regression.log`)：query assertion fixture 把 Booking ownership query 也納入 receipt query 清單；限縮到 actual reporting table 後 PASS。初始 current-negative fixture 使用未知 state pending，已改正式 `unavailable` 再重跑舊 query；PDF fixture property 使用實際 `fileName`。這些 fixture 修正不能當產品缺陷消除證據；舊版三個產品行為失敗皆發生於上述後續 assertion 之前。最終案例可直接對 immutable cec585 rerun，不 reset 活躍 worktree。

第三個修復單元：`booking-access.test.ts` 僅補完整 typed server identity 與原 mapping-test 的 actual ComplaintService/Repository hook prerequisite。保留原 ownership negatives 與所有 48 cases，未修改 Payment 的三個 Booking fixture/source 檔。原 public rating command 仍忽略 body rideId，委派實際 preparePassengerRatingHook(passengerId,routeId,false,command) 的同一 hook 給 MultiTaxi。Mapping test 的 rating persistence 邊界仍為原 delegation mock；完整 transaction 與 consent semantics 使用既有 rating-transaction suite 驗證，不假稱此 delegation test 執行 PG。

`pnpm exec vitest run tests/unit/pax-booking-history-20261009/booking-access.test.ts` 從 pristine cec585 的 FAIL1（4 FAIL / 44 PASS）到修正版 PASS0（48 PASS），`booking-access-final.log`。foreign/unknown/malformed 三個 negatives 恢復到真正 ownership check 的 404；合法 mapping positive 用實際準備的 consent hook，保留原 invalid-score negative/receipt handling。

### 第三份補充的最終檢查與剩餘 blocker

執行版本是已普通 push 的 `a956ae31268d64bdbd2dc30b6d368eeb31c71fd4`；其後只補 audit regression 兩筆輸入的 required `moduleName: complaint` 與本證據，沒有額外產品 source 變更。所有下列本機 checks 已完成並讀取。Node v22.23.2／pnpm10.33.0／TypeScript5.9.3／Vitest4.1.4；未啟動 VM server／PG／HTTP／browser／Docker，也未操作 provider/cloud/deploy/secrets。

| Finding／原 acceptance                                               | 最終原始碼／正式路徑                                                                                                                                                   | 舊版 → 修正版                                                                                                                                                                     | 已完成命令、結果與 evidence                                                                                                                                                                                                                                                                                                                                                        | 尚未滿足項                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-AUDIT-ACTOR                                                        | `SandboxRegulatorCaseAccessLogRecord.actorType` append-only literal；原 `PlatformAdminRegulatorCasesService.listRegulatorCaseAccessLogs` mapper 未改。                 | cec585 TS2322 FAIL2 → 修正版 root compiler PASS0。Real AuditNotificationService → mapper test PASS0/1，無 actor 偽造／record suppression。                                        | `pnpm exec tsc --noEmit` (`root-typecheck-completed.log`)；`pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/audit-access-log.test.ts` (`audit-projection-final.log`)。                                                                                                                                                                                              | 沒有新增 regulator 權限；不是 HTTP／IAM acceptance。                                                                                                                                                                                                                                                  |
| F-CURRENT-RECEIPT                                                    | `MultiTaxiRepository.findElectronicReceipt` formal `is_current`／`receipt_version` selection；既有 read map 與 CertificateSupport authority unchanged。                | Old selector + three probes FAIL1/3；new selector PASS0/23。Newest unavailable 或沒有 current 都拒絕，不回退歷史成功；account/token HTML/PDF 與 platform history positives 保留。 | `old-current-receipt-regression-final.log` → `current-receipt-regression-final.log`；AST scope (`range-and-repository-scope-review.json`) 實際 51 class members 中只改此 method，其餘50不變。                                                                                                                                                                                      | Mock 僅 SQL transport；V0062 schema/index/read-query 靜態逐欄核對，不是 PG proof。                                                                                                                                                                                                                    |
| Original Booking prerequisites                                       | `booking-access.test.ts` typed server identity、actual hook prerequisites/delegation。                                                                                 | Original 44 PASS/4 FAIL → 48 PASS0；R1–R9／ownership／session／terminal／付款／時間／score／contact 控制保留。                                                                    | `booking-access-final.log`；root affected regression 同時驗證原五個 Booking suites。                                                                                                                                                                                                                                                                                               | Mapping mock 不取代 actual rating transaction；Payment 三 fixture 檔完全未動。                                                                                                                                                                                                                        |
| `pax-complaint_intake_and_low_rating` / F-LOW-RATING / F-OPS-REPLICA | 原 producer/controller → same PoolClient rating/consent/CRM case/timeline/intake → awaited audit；原 Ops passenger-source durable reads。                              | 前輪修復未退化；原 38 intake + 40 transaction cases 與所有 negatives 包含在完成的 root affected regression。                                                                      | `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009 tests/unit/pax-booking-history-20261009 tests/unit/complaint.test.ts tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts tests/unit/system-remediation/sr-qa-reports-001/c098-electronic-ride-certificate.test.ts` PASS0/290 cases/13 files (`affected-root-regression-final.log`)。 | PG concurrency/rollback/restart/peer Ops HTTP、browser、原 required key 未接受；unit SQL fixtures 不滿足這些 gates。                                                                                                                                                                                  |
| `pax-receipt_e04_fields_and_passenger_download` / F-E04              | Actual `OwnedMobilityService.buildMultiTaxiCertificateEvent` → real writer/view/HTML/PDF probe；DriverCompleteTaskCommand 仍只有 aggregate fare，無完整 captured E04。 | Phone fix 保留；本輪 actual producer probe仍 FAIL2 `E04_REQUIREMENTS_UNMET`、readiness `PASSENGER_E04_NOT_READY`。完整 captured downstream positives不冒充真正上游 source。       | `pnpm --filter @drts/api build` PASS0 (`api-build-final.log`)；`node tests/unit/pax-receipt-complaint-20261009/e04-source-probe.mjs` FAIL2 (`e04-source-gap-current.log`)。                                                                                                                                                                                                        | **BLOCKER**：lawful issuer/operator、driver surname/credential mask、actual four components、captured payment method/total convention 仍無 upstream fact/source authority；完成 command/UI/payment producer 仍未授權。不得 quote-as-actual、default0、sample issuer、raw credential 或 fake success。 |

其他已完成檢查：

- API affected command：`pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi-passenger-authority.test.ts tests/unit/multi-taxi.repository.test.ts tests/unit/multi-taxi.controller.test.ts tests/unit/multi-taxi.service.test.ts tests/unit/multi-taxi-rating-read-contract.test.ts tests/unit/multi-taxi-controlled-export.test.ts tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts tests/unit/certificate-support.service.test.ts` PASS0/112 cases/9 files (`affected-api-regression-final.log`)。API typecheck/build + contracts/control-plane-auth build PASS0。
- Final root typecheck 初次 FAIL2 只因新 audit unit fixture 漏 required moduleName (`root-typecheck-final.log`)；補正式欄位後 PASS0 (`root-typecheck-completed.log`) 且 actual mapper regression 重跑 PASS0。這是測試前提修正，不是 another product defect。
- Scoped ESLint `--max-warnings=0` PASS0 (`lint-completed.log`)；full immutable62→HEAD original trailer checker、逐 commit literal Task-ID/actual Codex2/Codex identity、33 owned paths/write scopes、AST member boundary、canonical consistency、repo classification、whitespace PASS0。`range-trailers.log`、`canonical-consistency.log`、`repo-classification.log`、`range-and-repository-scope-review.json`。所有 bypass unset，configured task guard/Husky 正常跑；lint-staged 自身暫存備份正常結束，owner 未用 stash 保存設計意圖。
- Draft PR #2556 的 checkpoint CI 因後續普通 push 可能取消舊 run；每次 cancellation／skip／fail／pass 應以 actual head/run 區分。最後 checkpoint push 所啟動的 checks 由原 CLI progress/blocker 引用完整 SHA/run 及 `.local` receipts；沒有鎖 candidate，不把 draft ci-integ skips 當 full candidate CI。前輪 cec585 CI38129504495 TS2322 真實失敗紀錄完整保留。

本次三個精確 actionable source/fixture seams 均完成，剩餘 E04 upstream source/data 邊界需由 genuine Supervisor 協調；本 owner 不擴大 driver completion/financial policy scope。原兩個 required acceptance、同 candidate full CI／獨立 Codex review／protected merge、PG／HTTP／browser／PSP/legal/native/manual/full-system gates 均保留。**仍為 incomplete source checkpoint；不 handoff、不 done。**

本輪完整讀取 `/home/lupin/workspace/drts-fleet-platform/.local/pi-direct-booking-ui-20261011T1020Z/PAX-RECEIPT-EXACT-REMAINING-SOURCE-SEAMS.md` 及前兩份補充。起點 local、remote、draft PR #2556 head 都是 `cec585cc397eacbdf78a7d022771e1383e08e56c`；原六個 commit 與 immutable base `62a73710e87c0163c7e82a5956612be558e554bf` 保留，未重寫或同步已發布歷史。`origin/dev` 為 `2f6ec0ccbb7f102a99052fc7a08995056ebb1ea4`，沒有 receipt source overlap。

本輪機器 evidence 仍在 assigned worktree 的 `.local/pax-receipt-complaint-20261009/`。restore 後 ignored dependencies/logs 不在該樹；重新執行 isolated `pnpm install --offline --frozen-lockfile --ignore-scripts` PASS0，並沿用前輪方式複製 canonical 已有 `.husky/_` runtime shims。既有 task message guard、Husky chain、hook configuration 都保留；未設 bypass。

| Finding／驗收項                                                      | 本輪原始碼與精確修正邊界                                                                                                                                                                                                              | 舊版重現 → 修正版結果                                                                                                                                                                               | 命令／完成 evidence                                                                                                                                                                                                                                                                                                             | 未驗與限制                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F-AUDIT-ACTOR                                                        | `SandboxRegulatorCaseAccessLogRecord.actorType` 僅追加 truthful `first_party_passenger`。`PlatformAdminRegulatorCasesService.listRegulatorCaseAccessLogs` 原 mapper 已直接投影真實 actor；runtime 無須修改，case filter／roles 不變。 | pristine cec585 root compiler FAIL2；既有 CI38129504495 同 SHA typecheck FAIL。新 actual audit creation → mapper regression PASS，保留 actor 與 related-order matching、排除無關 case。             | `cec585-root-typecheck.log`、`cec585-ci-failed.log`；`pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/audit-access-log.test.ts` PASS0/1 (`audit-projection.log`)。Contracts build PASS0。API typecheck 初次 FAIL2 因缺 ignored control-plane-auth build output，非產品重現；完成 dependency build 後的結果另記。 | investigation/report storage 回應為 fixtures；不是 regulator HTTP／PG／IAM acceptance。                                    |
| F-CURRENT-RECEIPT                                                    | 本輪授權只改 `MultiTaxiRepository.findElectronicReceipt` current/version selection 與必要 read mapping；正式 V0062 已有 `is_current` partial unique 及 `(order_id,receipt_version)` unique。                                          | 尚在補最小舊版回歸，不宣稱已修。                                                                                                                                                                    | 下列 checkpoint 延續此項。                                                                                                                                                                                                                                                                                                      | 不可 state-filter 回退 superseded success；不改 writer／completion／Payment。                                              |
| Original Booking access prerequisite                                 | 本輪授權 `booking-access.test.ts` 的 server-derived first_party_passenger identity 與 real rating-hook dependency/delegation fixture；其餘 source 與 tests 不改。                                                                     | pristine cec585 48 cases：44 PASS、4 FAIL，三個 ownership rating negatives 因 fixture identity 缺 actor 被 401 擋住；mapping positive 同樣缺 actor，修後仍須提供 actual consent hook prerequisite。 | `pnpm exec vitest run tests/unit/pax-booking-history-20261009/booking-access.test.ts` FAIL1 (`cec585-booking-access.log`)。                                                                                                                                                                                                     | fixture correction，不能描述成產品 ownership 缺陷；原 R1–R9/session/payment/terminal/score/200char/contact controls 保留。 |
| `pax-receipt_e04_fields_and_passenger_download` / F-E04              | 原 E04 downstream source 與十三欄定稿保留。                                                                                                                                                                                           | 仍無 lawful upstream issuer/surname/masked credentials/actual four fare components/captured payment method/total convention；不製造 default facts。                                                 | 原 actual producer FAIL2 evidence 保留；最終會重跑 actual probe。                                                                                                                                                                                                                                                               | 不完整，不 handoff；PG／HTTP／browser／issuer witness pending。                                                            |
| `pax-complaint_intake_and_low_rating` / F-LOW-RATING / F-OPS-REPLICA | 前輪 actual transaction/intake/Ops read 與完整 negatives 保留。                                                                                                                                                                       | 本輪補 Booking fixture，不取代 actual rating transaction／intake tests。                                                                                                                            | 最終 affected regression 待跑並讀結果。                                                                                                                                                                                                                                                                                         | PG concurrency／cross-replica HTTP/Ops acceptance pending；未記 acceptance。                                               |

## 2026-10-14 原 owner 續作：immutable completion facts → receipt consumer

本節更新當前 source disposition；上文所有歷史 finding、失敗／skip、十個 immutable
原 own commit 及原兩項 acceptance 都保留。實際 Supervisor 凍結續作規格：
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261014T0238-root/receipt-continuation/PAX-RECEIPT-COMPLAINT-PRODUCER-CONSUMER-CONTINUATION-20261014.md`，
SHA256 `8544169b25911104cefa2763000afbaf8dd90f7e6c5d4ac158f576619e780b54`。
六個 Driver dependency 已 DONE；本輪沿原 Codex2/Codex、原 branch／PR #2556
續作，不以舊 helper 作 resume authority。

### Source 與 publication provenance

- 原 published `a81b1842a09fabdb6caffc160cf4edcc564604a2`、accepted dev
  `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1` 正常 merge 成
  `324c9ac2e930d4b24ab58ef50280bb4bb3e90117`，兩個 parent 與原十個 own commits 全保留。
  五個衝突均在 scoped complaint／event／Booking／passenger module；保留 accepted
  Payment 接線、Settlement Ops refresh，以及原 Receipt rating/intake/download 接線。
- 原正常 Husky/lint-staged 在 merge 時格式化八個 imported accepted 檔。
  Supervisor 已逐檔核對 formatter canonical equality，並透過凍結 R1 精確授權保留
  db212→324c9ac 的既有差異，未授權再改功能／workflow／policy：
  `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261014T0238-root/receipt-continuation/PAX-RECEIPT-CONTINUATION-R1-INHERITED-FORMATTING-20261014.md`，
  SHA256 `b121b3f293521476e6ba5cd0ba6fe5c7a0b1c5e4c2fe69438bff6aa77d4443be`。
  `merge-formatting/formatter-equivalence.json` 是格式等價證據，非 functional acceptance。
  八個 blob 在後續 own checkpoints 完全未改；未修改 hook/checker 或設定 bypass。
- Merge 的 ComplaintRepository 自動合併留下重複 PoolClient import，pristine
  324c9ac 新回歸因此 parse FAIL1/0 tests；`e2364ca3650d04a93962801e7a19a55cf57c4426`
  只消除該重複 import。這不是成功的 producer defect reproduction。
- Product consumer 修復版本：`98fac49f55183ef76b98fa4ea5ec136fefd25af8`。
  Test/probe 更新版本：`eb4ca1195618a6dc478fe0c87bfa062072a2549c`。
  後續 closeout 只記本頁證據，candidate 以正常 handoff 的完整 SHA／PR head 為準。

### Actual production mapping 與界線

`OwnedMobilityService.buildMultiTaxiCertificateEvent` 已輸出 flat
`actualFareBreakdown`、`driverSurname`、`driverSurnameSource`、
`driverSurnameProfileUpdatedAt`；`driverSurnameSnapshot` 是 producer local variable，
不是 event property。本輪不改已接受 Driver command／完成驗證／profile／outbox
或 Payment amount policy。Event type 正常 composition 同時保留既有完整 optional E04
與 accepted flat capture fields。

`CertificateSupportService.writeCompletedTrip` 與 `toView` 現在複製並投影已捕捉的四個
actual components 及完整 self-declaration provenance。它們獨立於完整 `e04Snapshot`：
缺外部資料的正常完成事件仍可保存；未傳入 partial E04 去觸發
`CERTIFICATE_E04_SNAPSHOT_INVALID`。新舊 view 不共用可變 breakdown object，零值保留，
不轉換估價、猜姓氏、讀 current profile、發明日期／issuer／credential／付款，
也不以 component sum 推定 aggregate/toll convention。Declaration 原字串及 whole-profile
revision 原字串保留；這不是 legal identity verification。

真實儲存表為 `reporting.multi_taxi_electronic_receipts`，不是 billing schema。
已逐欄核對 V0056 的 record JSONB 與 V0062 的 current/version/unique constraints。
既有 `CertificateSupportRepository.persistInitial` 將完整 record 序列化至 `$7::jsonb`；
`regenerate` 複製 sourceRecord 到 `$12::jsonb` 並只更新 version/artifact/regeneration
metadata。因此無需 SQL column／migration 或 repository source 修改。
測試直接呼叫這兩個正式 repository，SQL 回應 fixtures 不代表 PG 實測。

既有 renderer 在有 flat capture 時顯示四個 actual fare components 與
「駕駛自填姓氏（非身分核驗）」、來源、whole-profile revision。完整 E04 的 issuer／mask／
payment 路徑保留。Legacy 沒有 flat facts 時保持缺失，不從 E04 回填 provenance。
原 aggregate/toll 顯示及合計慣例不改。正式 account/token artifact adapters 仍共用
`getPassengerView/getPassengerArtifact`，缺完整 E04 時拒絕；平台舊 artifacts 保持相容。

### 本輪 finding／原 acceptance 對照

機器 evidence 在 assigned WT 的
`.local/pax-receipt-complaint-20261009/continuation-20261014/`；所有命令在 assigned cwd，
Node v22.23.2、pnpm 10.33.0、TypeScript 5.9.3、Vitest 4.1.4。
外部 clock、registry、完成／profile／full-E04 capture 及 SQL 回應為 unit fixtures；
producer projection/fare validator、writer、正式 repository、view、HTML/PDF、account/token
controller/ownership/rating/intake/Ops business logic 均使用正式實作。
未寫入真實 PG／外部 issuer／PSP，也未發佈任何 simulated artifact 為真實證明。

| Finding／驗收項                                      | 原始碼與修復位置                                                                                                            | 舊版 → 修正版結果                                                                                                                                        | 完成命令／退出碼／evidence                                                                                                                                                                                                                   | 未驗與限制                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-E04 captured facts consumer                        | 正式 producer → CertificateSupportService writer/toView → JSONB/current MultiTaxi read → renderer/account-token artifact    | e2364ca 舊 consumer 3 FAIL /23 PASS；修復後同三項通過，26/26 PASS。後加 legacy/zero/real-regeneration regression 最終29/29 PASS。                        | `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts`：old `producer-consumer-old-functional.log` FAIL1；new `producer-consumer-new.log` PASS0。Final receipt suite 在 `affected-root-final.log` PASS0。 | Registry/SQL/immutable input 邊界為 fixtures；不是 completion HTTP/PG/legal issuer acceptance。                                                                                        |
| `pax-receipt_e04_fields_and_passenger_download`      | 真實 producer/writer/renderer probe 保存 actual four components、自填姓氏及來源／revision；原完整 passenger readiness guard | 四個 actual components 已保存／顯示，service phone 正確；真實完整 E04 仍 `PASSENGER_E04_NOT_READY`，probe **FAIL2 E04_REQUIREMENTS_UNMET**。             | `node tests/unit/pax-receipt-complaint-20261009/e04-source-probe.mjs` → `e04-source-gap-current.log` FAIL2。Probe 的 prototype receiver 改為保留真實 helper；缺少 full issuer/mask/payment/total labels 逐項保留。                           | Lawful issuer/operator mapping、masked credential capture、settled PSP/payment display／total convention 仍缺。此 key **UNRECORDED**；PG/HTTP/browser/provider/legal/manual 尚未接受。 |
| F-LOW-RATING / `pax-complaint_intake_and_low_rating` | 原 Booking→MultiTaxi rating PoolClient→CRM/intake/consent 與 Ops production 路徑保留                                        | 原客訴／rating unit 78/78 PASS；完成現行 Payment guard 所需同一帳號 fixture，未 mock 掉 guard 或修改 Payment source。                                    | `complaint-rating-composed.log` PASS0/78；完整 `affected-root-final.log` PASS0/296/13 files。原 opt-in/off/highscore/immutable payload/foreign/window/payment/failure/retry/lost ack cases 保留。                                            | SQL fixtures 不是 PG atomicity/concurrency 或 cross-replica Ops HTTP；此 key **UNRECORDED**。                                                                                          |
| F-CURRENT-RECEIPT                                    | 原 findElectronicReceipt current/version selection；正式 regenerate sourceRecord preservation                               | Current/unavailable/no-current/history 正負案例均保留；新增 actual regenerate→current read 保存 immutable facts／revision，仍不可發乘客 incomplete E04。 | 同 final receipt/root regression PASS0；repository 的 storage/transaction 結果是 fixtures。                                                                                                                                                  | 真實 PG constraint/lock/restart 與 hosted artifact HTTP pending。                                                                                                                      |
| F-AUDIT-ACTOR / F-OPS-REPLICA                        | 原 truthful actor mapper、durable passenger-source Ops read，加上 accepted settlement refresh                               | 原 audit projection 與 intake/rating/Ops 回歸 PASS；沒有 identity 偽造或 source cache-only shadow module。                                               | Root13 files PASS0；API9 files PASS0/112（`affected-api-regression.log`）。                                                                                                                                                                  | PG/replica/browser/regulator witness 不以 unit PASS 取代。                                                                                                                             |
| 原 upstream 與 publication provenance                | 原十個 own commits、新 merge 與新 own exact trailers；官方 checker 無修改                                                   | Actual `origin/dev..HEAD` trailer PASS0；完整 raw62→HEAD **FAIL1**，兩個 upstream `[ReviewBus]` subjects 原封保留。                                      | `current-ci-range-trailers.log` PASS0；`raw62-range-trailers.log` FAIL1：1fba7476925b、942a702c6e49。`history-scope.json` 驗十個 ancestor、全部 own literal roles、41 scoped netdiff paths、八個 inherited blobs 未變。                      | Raw FAIL 不改稱 PASS，不 attributed to Codex2、不 bypass/history rewrite。Final source 還需 exact Codex review／same-SHA hosted full CI／protected merge。                             |

### 完成 checks 與保留 failures

- API build（含 contracts/control-plane-auth prebuild）：`api-build-initial.log` PASS0。
  新 product source 在98fac49完成，後续eb4ca只更新 test/probe。
- Final `pnpm typecheck:root`：`root-typecheck-final.log` PASS0。
  前次 `root-typecheck.log` FAIL2 來自正在修正的新增 regeneration fixture assertion
  將 unknown record 傳入 toMatchObject；已改成只比較四個 immutable fact values，未 cast
  或修改 production identity/PG logic。
- Final root affected argv：`pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009 tests/unit/pax-booking-history-20261009 tests/unit/complaint.test.ts tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts tests/unit/system-remediation/sr-qa-reports-001/c098-electronic-ride-certificate.test.ts`；PASS0，296 cases /13 files。API argv 沿原九項 affected suites，PASS0/112/9 files。
- 初始 root296前版 (`affected-root-initial.log`) FAIL1：78個 fixture 在 booking 新 Payment
  account lock lookup 未提供同一 drtsPassengerId，215 PASS；修正 own Receipt fixture 的
  account/snapshot ID，未改既有 Payment-owned fixture 文件或 source／政策。
- `producer-consumer-old.log` parse FAIL1/0 tests、`producer-consumer-old-reproduction.log`
  booking prerequisite FAIL1/26 cases，均不作舊 consumer 缺陷重現。有效 old-fail 是修正前提後
  的 `producer-consumer-old-functional.log`，3 FAIL/23 PASS。
- `producer-consumer-regeneration.log` 初次 FAIL1/1 failed+28 passed，原因是 fixture 錯把
  正常新 version/generatedAt/URLs metadata 當不可變；修正比對範圍後 final PASS。這不是
  repository regeneration 故障；首次 log 保留。
- Scoped ESLint `--max-warnings=0` (`scoped-lint.log`)、canonical consistency
  (`canonical-consistency.log`)、repo classification (`classification.log`) PASS0。
  Whitespace、final own message/scope/remote/PR identity checks 於 final publication receipt 記錄。
- 無 VM product server、PG、browser、Docker、deploy/cloud/secret/cleanup；未呼叫 done、
  self approve 或 record-acceptance。此前 checkpoint CI cancelled/skip/FAIL/PASS 按原 SHA
  留存，draft skips 不是 final candidate full CI。

本輪可以正常固定 source candidate 交獨立 Codex；缺真實外部 facts 不阻止已授權
source 實作交審。Source/review/CI/merge 與真實 E04、CRM/PG/HTTP/browser/PSP/native/manual、
full-system DONE 仍分開；原兩項 key 在 genuine evidence 前維持 **UNRECORDED**。

## 2026-10-14 R2：supported token low-rating contact 最小重現與修正邊界

本節是原 Codex2 owner 對新 source finding `F-TOKEN-LOW-RATING-CONTACT` 的定位
checkpoint，**不是修復候選或交審**。保留上文所有 finding、原 review、CI、merge 與
未解 acceptance，不以此前 account-path 的 PASS78 覆蓋 token-path 的產品失敗。

### 本輪來源與執行身分

- 原獨立 Codex receipt：`REVIEWED_SHA=ddbc97426b8dc881ac1a5ec95202149ed31cc829`，
  generation `818b341aacee41c1a171db40861cf927`，acceptance-review request
  `85d5fef97038444bb31589158fbc2270`，此前正常 merge
  `32eb87f19e2a7ccb978057785bfad4116246916f`。Source reopening 已由原 reviewer 完成；
  不沿用原 approval，兩個原 key 仍 UNRECORDED。
- 凍結 R2：canonical root 的
  `.local/goal-continuation-20261014T0238-root/receipt-continuation/token-low-rating-source-followup/PAX-RECEIPT-R2-SUPPORTED-TOKEN-LOW-RATING-CONTACT-20261014.md`。
  已讀原 task/common A9/A12、SA/SD、定稿 E18/E18b、實際 caller/contract/service/repository/V0056/V0114。
  Ride 原獨立 receipt SHA256 仍為
  `4059c81796baf2344522066b6a9467c73be906369a7e384d7a331d852fdae6b2`。
- 留在 Supervisor assigned isolated worktree，以新 branch
  `codex2/pax-receipt-complaint-20261009-token-contact-20261014` 續作。
  `git fetch origin` 後，從32eb87正常 fast-forward 至執行 source
  `a6890213c907017e3c1be8761d5cd94ba601e3c0`；該新 branch 當時無 remote ref 或 PR。
  未改寫任何 published history，未切 canonical root。
- 核對 source SHA256 與原 reviewer 一致：MultiTaxiService
  `3d7656a9aa672fdaef861616b5afaed97ec2c1b4cf9446d67e67a82ea163de75`、MultiTaxiRepository
  `23163e1efc2c00e00cc3c2f5125fb78c096e46fa63323ae1fc20c63af46ca2db`、rating contract
  `6f73eb4471dff5e29d5fbe3dad1a24ef08f0b20bcea329d082df3f3f58faf55e`。
  本 checkpoint 沒有 product、migration、auth、workflow、QA harness 或外部環境修改。

### 最小重現、實際差異與邊界

已加入可重跑的
`tests/unit/pax-receipt-complaint-20261009/token-rating-contact.test.ts`，直接執行
`MultiTaxiController.submitPassengerRating` → `MultiTaxiService.submitPassengerRating`
→ `MultiTaxiRepository.persistPassengerRating`。只 fixture SQL 回應與 completed
order/assignment；實際 digest、scope/expiry/revocation、score/tags、交易 SQL、mapper
與 replay logic 全用正式實作。未知 SQL 直接拋錯；沒有複製 business SQL、建鏡像表或啟動 server。

觸發為 valid unexpired `ride:rate` token、已完成有 assignment 的 multi_taxi_direct
order、`{score:2,contactRequested:true}`。預期成功前原子保存原始 contact choice、
一個 canonical CRM case 及初始 timeline；同 payload 重試保留 rating/case，改 contact
則衝突。實際 rating 成功並 COMMIT，case 寫入為0；同 payload 同 ratingId，反向 contact
仍成功。這兩項是 **FAIL1 的產品失敗**，不是 import/setup 失敗。False、omitted、high
score 及 missing/expired/revoked/wrong-scope/incomplete/unassigned 六種拒絕控制共9例 PASS。

原因逐一核對：

- `SubmitPassengerTripRatingCommand` 只有 score/tags/comment；controller 原樣傳入。
- `MultiTaxiService.submitPassengerRating` 不讀 contact，cached replay 只經
  `assertIdempotentRating` 比對 score/tags/comment，persist 沒有 hook。
- `MultiTaxiRepository.persistPassengerRating` 的 accountHook 才執行 account/booking
  ownership、completion/payment/window 與 consent/CRM；token caller 沒有此 hook。
- `ComplaintService.preparePassengerRatingHook`、
  `ComplaintRepository.persistPassengerRatingConsent/persistPassengerIntakeWithClient`
  及 V0114 明確要求 active `passenger.accounts`、`booking_histories` FK。
  Legacy token subject 不能偽裝 drtsPassengerId；不能假造帳號或改已套用 V0114。

### 已送 Supervisor 的具體配號與 QA 協調請求

透過本 task 的 current-release CLI `progress` 於 `2026-10-14T04:51:49Z` 記錄。
現有 schema-allocation 僅配本 task 的 V0114；V0116 屬 Push，V0117/118 另有 owner。
提出 **尚未配給、不得視為授權的**
`V0119__passenger_ride_rating_contact.sql`（須 Supervisor 核對全域保留並決定實際檔號）。
本輪不自行改 schema-allocation，也不建立未配號 migration。

待配號的最小 durable seam 建議為 `ops.passenger_ride_rating_consents`，使用
V0056 的 varchar token/order/subject/rating authority；不使用 account/booking FK。
一筆 immutable consent 同時作 token-source intake，保存原始 boolean、normalized
payload hash、原 token id、rating id 及 optional canonical CRM case FK。
對 (order, subject)／rating 唯一、case 唯一；所連 token/rating 的 order 與 subject
必須一致。False／omitted 新請求按相容行為記 false，高分 true 保存原選擇而不建案。
既有未捕捉 consent 的歷史 rating 不得補猜同意或追建案；確切 legacy replay 行為須在
實修時按現有 account semantics 與 omitted compatibility 逐例核對，不捏造歷史 consent。

下一個不可分割 source 單元：既有 token contract 增 optional boolean；用已驗證 token
的真實 authority，沿現有 repository transaction seam 加 token 專用 hook（不走
account hook）；交易內重讀/鎖定有效 token 與 order/assignment/completion/payment/window，
以既有唯一鍵/lock 將 rating、consent/intake、CRM case/timeline、driver summary 同交易提交，
commit 後才更新 cache/回成功。既有 canonical ComplaintService/Repository 建案與 Ops
durable source read 擴充此 token intake；不另造 token complaint endpoint、假帳號或 auth。
正常／lost-ack replay 必須讀原始 durable 記錄；改 payload/contact 必須409；不以 cached
rating 跳過 consent 比對。原 account40、intake38、E04 全部保留。

Supervisor 尚須讓原 `PAX-QA-20261009` 依正式新 migration 擴充 supported-token cases：
selected/unselected/omitted/high-score、same/changed payload、concurrent same/different
choice、rating/CRM/timeline/intake/consent/summary failure rollback、commit lost reply、
restart/peer Ops、expired/revoked/wrong-scope/foreign order/subject/assignment、payment/window。
本 owner 不接管 QA harness；mock SQL 不能替代正式 PG constraints/concurrency、mounted
HTTP/peer Ops 或真實 runtime acceptance。

### 本輪 finding／acceptance 證據表

證據位置是 assigned WT `.local/pax-receipt-complaint-20261009/token-contact-20261014/`。
Node v22.23.2、pnpm10.33.0、TypeScript5.9.3、Vitest4.1.4。

| Finding／驗收項                               | 原始碼與修改位置                                                                         | 舊版 → 修正版結果                                | 命令、退出碼與 evidence                                                                                                                                                                                                                                                                              | 未驗與具體限制                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| F-TOKEN-LOW-RATING-CONTACT                    | controller → token service → rating repository；新增 own regression，product source 未改 | a689021 原缺陷2 FAIL／9 PASS；修正版尚未實作     | `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/token-rating-contact.test.ts --maxWorkers=1 --no-file-parallelism`：`old-production-regression.log` exit1，11例；formatted 同案例結果及其他 checks 見下方                                                                            | 先完成 Supervisor 正式 forward migration 配號；不可套 account FK 或自行分配檔號。紅色 regression 是 checkpoint，不 handoff。       |
| pax-complaint_intake_and_low_rating           | 原 account rating/consent/CRM、intake 與 Ops source 保留                                 | account40+intake38 PASS；supported token 仍 FAIL | `pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/rating-transaction.test.ts tests/unit/pax-receipt-complaint-20261009/complaint-intake.test.ts --maxWorkers=1 --no-file-parallelism`：`account-intake-regression.log` exit0，78/78，6.40s；已讀預期 fault-injection rollback warnings | Key UNRECORDED；token source repair、formal PG/HTTP/concurrency/peer Ops pending。                                                 |
| pax-receipt_e04_fields_and_passenger_download | 本輪未改 E04 producer/consumer/renderer/download；原未解行保留                           | 無新 acceptance credit                           | 本輪不重跑無關 E04 probe；原 FAIL2 E04_REQUIREMENTS_UNMET 及原 scoped PASS 皆保留                                                                                                                                                                                                                    | Key UNRECORDED；lawful issuer/operator、masked credential、captured payment/total convention 及 runtime/legal witness 仍 pending。 |

此 checkpoint 只能普通 commit/push 留存 red reproduction 與修正邊界，不是可接受候選。
尚未 handoff、approve、record-acceptance 或 done；沒有 product/API/PG/browser/preview/Docker
server、實際外部服務呼叫、workflow dispatch 或部署。

完成並讀過本輪其餘檢查結果：

- 格式化後相同 production regression：`old-production-regression-formatted.log` exit1，
  仍2 FAIL／9 PASS，6.52s。缺 case 與 changed contact 被接受，都是同一正式 source 缺陷。
- `pnpm --dir apps/api exec vitest run tests/unit/multi-taxi.service.test.ts tests/unit/multi-taxi.controller.test.ts --maxWorkers=1 --no-file-parallelism`：
  `legacy-token-baseline.log` exit0，36/36，7.90s。舊測試未涵蓋 contact，不能抵銷新紅例。
- `pnpm exec eslint tests/unit/pax-receipt-complaint-20261009/token-rating-contact.test.ts --max-warnings=0`：
  `scoped-lint.log` exit0。兩個 own 檔經 Prettier 格式化，`git diff --check` exit0。
- `pnpm typecheck:root`：`root-typecheck.log` **exit2**。共享依賴無法 resolve
  `@drts/passenger-client`，以及 `@drts/api-client` 指向另一個 QA worktree，導致 private
  `requestEnvelope` 身分不一致與相依 implicit-any diagnostics；無新增 own test diagnostics。
  未安裝套件、改共享 node_modules／compiler config 或以此環境失敗充作產品重現。
  此命令不是 PASS；所有已啟動檢查均已等候結束並讀結果。

## 2026-10-14 R3：Supervisor 正式配號與原 owner 續修

本次 dispatch 保留 `18a48f77f2445699faafa8bad8a67d5302d6e6fb` red checkpoint，
local／remote／draft PR2627 head 一致。於 05:03:24Z，實際 Supervisor 已核對
全域保留並在同一 task 的 `migration_allocations` 正式配給
`infra/migrations/V0119__passenger_ride_rating_contact.sql`，更新 frozen R3 spec。
先前配號卡點已解除；owner 的 05:03:33Z note 在讀到新狀態前送出，不能用該舊 note
否定正式 allocation。已用 current-release CLI progress 記錄續修。

正式 allocation 原始 bytes 已複製到
`docs/04-uat/passenger-app-20261009/schema-allocation-20261014-token-rating-contact.json`，
SHA256 `3c922809269f43b83d32b5a68a974ccbba9ab7c7ed468f3f84b5f13e9d9ad1db`。
不修改 dirty canonical root 全域 ledger，不重寫 V0114、不捏造 account。
V0119 以現有 varchar token/order/subject/rating 與 canonical CRM FK 保存原始 choice；
複合 FK 同時核對 rating score、order、subject 與原 token，唯一鍵避免重複 consent/case。
舊 rating 不補猜 contact choice。此 schema checkpoint 尚不是修復候選或 PG 驗收。

本次 assigned WT 原 `.local/.../token-contact-20261014/` 目錄不在；既有 tracked
red regression／UAT 仍完整。新的可追溯紀錄位於
`.local/pax-receipt-complaint-20261009/token-contact-resume-20261014/`，不冒稱恢復舊 log。
在未改 product source 的 `18a48f77f2445699faafa8bad8a67d5302d6e6fb`：

- 相同正式 token regression 命令：`token-red.log` exit1，2 FAIL／9 PASS，5.36s；
  原缺 CRM 與反向 contact replay 被接受皆重現。
- 相同 account rating／intake 命令：`account-intake.log` exit0，78/78，6.83s；
  fault-injection rollback warnings 已讀。
- 相同 API legacy token service／controller 命令：`legacy-token.log` exit0，36/36，7.07s。
- Node22.23.2、pnpm10.33.0、Vitest4.1.4、TypeScript5.9.3。以上 checks 均完成並讀取。

後續 source repair、新版正負與 failure/replay 回歸、同 SHA 獨立 review／CI／merge 仍待完成；
原兩項 acceptance key 與 PG／mounted HTTP／peer Ops／legal facts 全部保留未驗。

### R3／R4 修復結果與正式呼叫路徑

保留相鄰候選 `ddbc97426b8dc881ac1a5ec95202149ed31cc829`、原 generation818、
原 Codex 的 source reopening／Ride f59 review 與18a red checkpoint。新 source
在 `6d58eacd4` 完成；`b86e70482` 補 production regression，`7ba8a7112` 完成
R4 ledger append 與 Ops negative assertion 修正。全部 ordinary push，沒有歷史改寫。
最終 candidate identity 以本 task CLI handoff 與下面的 publication manifest 為準，
不得沿用舊 source approval／CI／merge32。

實際修復位置與 caller：

- 既有 `SubmitPassengerTripRatingCommand` 增 optional boolean `contactRequested`；
  既有 `MultiTaxiController.submitPassengerRating` 保持同一路由／envelope。
  `MultiTaxiService.submitPassengerRating` 核對 token 與 order subject、驗證 boolean，
  durable 路徑每次都進 transaction，不能由 rating cache 提早回成功。
  既有 account caller 的 constructor 位置與 `submitTrustedPassengerRating` 不變；
  `MultiTaxiModule` 附加既有 `ComplaintModule`，注入同一 canonical service。
- `MultiTaxiRepository.persistPassengerRating` 的原 client／execute seam 接收 token
  context；同一 transaction 依 token ID/digest/order/subject 重讀並 share-lock 有效
  scope/expiry/revocation、正式 order/subject/completion，沿既有 rating advisory lock／
  unique upsert 與 completion task/payment/window 檢查，再保存 consent／CRM／summary。
  Account hook 的 account/booking locks 與拒絕語意保留；token 不走 account hook。
- `ComplaintService.preparePassengerRideRatingHook` 沿現有 case／timeline builder；
  低分且 true 才有 draft，`ComplaintRepository.persistRideTokenRatingConsent` 用原
  `persistChanges(..., client)` 寫 canonical CRM，保存不可變 consent/intake 後才 COMMIT。
  exact replay 讀原 choice/hash/case/timeline；changed score/tags/comment/contact 為409，
  不覆寫資料或重建 case。commit／audit 回覆遺失可沿原 durable record 重試。
- 新 omitted contact 按 false 保存；high score true 保留 true 而沒有 case。
  pre-V0119 historical rating 沒有 choice 時，omitted exact retry 相容、不 backfill；
  explicit true 或 false 都回 `PASSENGER_RATING_CONSENT_UNAVAILABLE`，不猜歷史同意。
  explicit choice 缺 durable storage／CRM service 時回503，不顯示成功。
- 原 `listPassengerCases/getPassengerCase/getPassengerTimeline` 的正式 SQL source 範圍
  附加 token consent 所連 canonical case；既有 Ops controller/service 可跨新 instance
  讀取。commit 後才 publish/audit；token audit 為 `system`／null actor、
  `source=passenger_ride_token` 與真實 subject，沒有冒稱 first-party account。

V0119 正式 SQL 與 production repository 逐欄核對：

| 正式欄位／constraint                     | Production binding／依據                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| order_id／passenger_subject_ref，複合 PK | rating.orderId／rating.passengerSubjectRef，現有 varchar(255)；正式 order FK  |
| rating_id，UNIQUE                        | storedRating.ratingId；與 order/subject/score 的複合 FK 同時對照 V0056 rating |
| original_token_id                        | verified token.tokenId；與 order/subject 的複合 FK 同時對照 V0056 token       |
| rating_score                             | storedRating.score，smallint 1–5；複合 FK 防不同 rating score                 |
| source                                   | DB default/check `passenger_ride_token`，不是 account source                  |
| contact_requested／request_hash          | 原始 normalized boolean／score+sorted tags+trimmed comment+choice SHA256      |
| complaint_case_no，UNIQUE／CRM FK        | 同 client 的 canonical case；CHECK 要求且僅允許 selected score≤2 有 case      |
| created_at                               | original storedRating.submittedAt；retry 不修改 consent                       |

Applied V0114 bytes 與 a689 完全相同，SHA256
`14a5d8a13ab5be4bf7b1e1b978c0c0dde115460df4fefbcb9f6a0691b86df4ed`。
Account/booking、E04 writer/renderer/download、OwnedMobility、auth、workflows 與 QA harness
沒有 source diff。上述 DDL/SQL 核對不是 PostgreSQL 執行或 concurrency 驗收。

R4 frozen spec SHA256 `8f9df5d16512a83fbe8a5e50721d305eedee87a61015b709ff4a9af88d51b605`
正式授權 OWN WT ledger 的唯一 V0119 append；entry source hash
`beaaaf6d4a1c3b76f5a4fa7370a4cc437015b15325e0f250372168607def0a9b`。
移除新最後一列後，JSON 所有舊 semantic values 與 accepted a689 完全一致，
無其他 allocation/amendment 改動、無 dirty canonical root 寫入或匯入。
兩個既有 guard tests 與全部 assertions 原封保留。

### 本輪完整驗證表與仍未滿足的 acceptance

Evidence 位於 assigned WT
`.local/pax-receipt-complaint-20261009/token-contact-resume-20261014/`。
`source-evidence.json` 保存命令、exit code、版本、執行來源、log 與 source hashes；
`publication.json` 保存最終完整 candidate SHA/branch/PR/local-remote identity。
外部 SQL 回應、completed order/assignment、transaction acknowledgement、audit failure
是 fixtures；正式 controller/service/repository/hash/mappers/SQL/case builders 都未 mock。
Fixture commit/rollback 只是回應邊界，不能證明 PostgreSQL 原子性、锁或 FK 行為。

| Finding／驗收項                                                     | Source／修改                                                                                           | 舊版 → 修正版                                                                                                                                                                                                                                                          | 命令／結果／evidence                                                                                                                                            | 未驗與限制                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F-TOKEN-LOW-RATING-CONTACT：score2/selected 與 changed-choice retry | 同正式 token controller→service→rating repo→Complaint service/repo                                     | 18a 2 FAIL/9 PASS → same 11 assertions PASS；擴充46皆 PASS                                                                                                                                                                                                             | 原 token vitest 命令：`token-red.log` exit1；`token-green-initial.log` exit0/11；`affected-root.log` exit0 含 token46                                           | SQL fixture；未宣告 PG、mounted HTTP、concurrency、peer Ops 真實驗收                                                                       |
| Token normal/replay/failure/authority 正負回歸                      | V0119 consent；同 client CRM/timeline/summary；Ops durable reads                                       | score1/2 true、false/omitted/high true；exact/changed payload；historical choice；restart/Ops；7種 failure rollback、lost commit、failed rollback/audit、cached expiry/revocation/scope、foreign subject/completion/assignment/payment/window、invalid contact 全 PASS | `affected-root.log` exit0，342/14 files，39.52s；新 token46、原 account40/intake38、receipt29/regeneration 與 affected booking/CRM 全保留                       | 尚需原 PAX-QA 使用正式 migrations+production repositories 量測 concurrent same/different choice、所有 rollback/restart／真正 HTTP/Ops 路徑 |
| F-V0119-ALLOCATION-CONSUMER                                         | 既有 global ledger passenger_app_allocations 只 append Supervisor exact entry                          | 原 unchanged tests 2 FAIL/56 PASS（119≤118）→ 58/58 PASS                                                                                                                                                                                                               | 同兩個 vitest files：`allocation-consumers.log` exit1；`allocation-consumers-final.log` exit0，2.10s；PAX-SD 既有3 PASS0，`pax-sd-ledger.log`                   | 不改 test、assertions、gate 或 schema 配號；不是 DB 行為                                                                                   |
| 原 account/E04/CRM/API 整體回歸                                     | Account hook、原 capture/download/regeneration、Ops lifecycle/incident/audit、rating reads/export/repo | 原 78/36 baselines PASS；affected root342、API114 PASS                                                                                                                                                                                                                 | root 同上；API10 exact files：`affected-api-final.log` exit0/114/10，16.14s；初始 API argv7實際只匹配5 files/73，未冒稱7檔全跑                                  | unit PASS 不取代真实 completion/PSP/PG/HTTP/browser/native/legal evidence                                                                  |
| Source type/build/lint                                              | 正式 contracts/auth/API compiler 與 scoped ESLint                                                      | `pnpm --dir apps/api build` PASS0；ESLint PASS0；root typecheck仍環境 FAIL2                                                                                                                                                                                            | `api-build.log` exit0，含 prebuild；`scoped-lint.log` exit0；`typecheck-final.log` exit2，缺 passenger-client + foreign QA api-client links；無 own diagnostics | 未修改 compiler/config/shared dependency links，沒有隱藏 workaround；root command 不標 PASS                                                |
| pax-complaint_intake_and_low_rating                                 | 本輪 token producer 已修；原 account/intake/Ops 行為保留                                               | Source positives/negatives 通過；required key **UNRECORDED**                                                                                                                                                                                                           | 上述 production-path source evidence；新 SHA/gen 必須獨立 review、同 head full CI/protected merge                                                               | 正式 PG transaction/unique/concurrency、mounted HTTP/peer Ops/acceptance 仍由原 QA；不能借 account fixture 綠燈                            |
| pax-receipt_e04_fields_and_passenger_download                       | 本輪未改 E04 source，原全部 finding 保留                                                               | 原 receipt29/regeneration source PASS 保留；完整 E04 原 FAIL2/NOT_READY 未豁免                                                                                                                                                                                         | affected root receipt source回歸 PASS0；不重跑與本 seam 無關的缺外部facts probe                                                                                 | Key **UNRECORDED**；issuer/operator/masked credential/payment display/total/toll、真實 download/PG/HTTP/legal facts pending                |

保留初始 FAIL：`token-green-expanded.log` 45 PASS/1 FAIL（新 fixture test 期待了不存在的
Ops error `COMPLAINT_CASE_NOT_FOUND`，正式回傳是 `NOT_FOUND`），修正 own assertion 後
root342 PASS；不是 product Ops 故障，也不算舊 token 缺陷重現。
第一個 ledger Prettier check FAIL1 只因新 array 的格式，僅格式化新增列後通過；
未削弱 assertions 或重寫其他設計。所有已啟動本機 checks 均已結束並讀結果。

最終 source candidate 走 normal substantive commit/ordinary push/原 PR2627/newSHA-gen
handoff 給原獨立 Codex。Hosted CI、review、merge 是新 candidate 的後續 lifecycle evidence，
pending 不冒稱 PASS；原 ddbc 綠燈不借用。本 VM 沒有 product/API/PG/browser/preview/Docker
server、workflow dispatch/rerun、provider/external service call 或部署；沒有 approve、
record-acceptance 或 done。
