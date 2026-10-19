# C072 canonical command ACK — original full6 delivery

Task: `REGISTRY-CONTRACT-INSURANCE-EXCLUSIVITY-CANONICAL-ACK-FLOW-20261015`  
Author: Codex2. Independent reviewer: Codex (Root).  
Immutable execution base: `c05c6e133d8066abea349b2285ac653eadef8015`.  
Specification: `RegistryCommands-R4-full-original-plus-one-existing-C073-policy-caller.task-spec.json`, SHA256 `d3f8b6481616ce7bc5432412c2f3be1d0bace5f5cf0f1fb632f6b8b798245423`.

The original C072 implementation/history (including `dc2775838f2d058dc1edaea7b21ba65dbe27414a`) remains provenance. This ordinary successor repairs its seven existing commands; it does not claim the old authors' work as new implementation. Candidate SHA, remote branch, PR and generation are bound by the immutable handoff packet.

## Resulting behavior

The existing controller waits for create/activate contract, create/activate insurance, and submit/approve/reject exclusivity. Each command stages its record and vehicle projection without replacing shared arrays. Enabled storage reads and locks the existing vehicle row, reads its associated records and writes the command delta plus vehicle using one dedicated client/transaction. Existing effective-window, declaration, lifecycle, offboarding, manual-hold and supply predicates run on that staged view.

Only an acknowledged commit publishes the command's cache delta and lifecycle event. Ordinary BEGIN/write/rollback/release errors reject. A COMMIT response uncertainty is separately identified after work completed; a new canonical transaction must match the prepared record ID, complete record and vehicle before it can confirm that attempt. Explicit PostgreSQL transaction rejection remains an error even when the same values already existed. A newer lawful transition is read back and retained rather than overwritten or reported as the older command's success. When confirmation is unavailable, the existing error channel returns `REGISTRY_COMMAND_NOT_ACKNOWLEDGED` with the prepared record ID for authoritative reload and legitimate same-record retry. Repeated successful create calls continue creating distinct records; no same-body deduplication was introduced.

The seven commands have async service boundaries, including controlled no-DB mode. Other Registry writers, the generic detached persistence helper, driver master ACK, C073 transitions, expiry/reminder producers and their immutable identities are unchanged. Active insurance renewal uses the existing B4 supersession helper in the same command transaction. Existing late-receipt handling remains the B4/Preexpiry implementation.

## Original six clauses and evidence

### Original clause 1

Complete only the original C072 ordinary seven commands: createContract, activateContract, createInsurancePolicy, activateInsurancePolicy, submitExclusivityReview, approveExclusivity and rejectExclusivity through their existing regulatory controller/service/repository paths. In enabled canonical storage, actual HTTP/envelope success must wait for the relevant write/commit; pending must stay pending, and rejection must reach the existing caller error path. Stage the changed record, vehicle lifecycle projection and success events/audit until authoritative ACK. A void catch-log, optimistic cache or GET of that same optimistic cache is not proof of persistence.

Evidence: `commands.test.ts`: the original three before/fixed cases plus all seven delayed-envelope and coupled-write-rejection cases use the actual controller/service/repository. `actual-before-collected` direct1 recorded 3 FAIL. `first-fixed` direct0 recorded the same three scenarios PASS (only necessary awaits added to preparation).

### Original clause 2

Keep the related contract/policy/exclusivity and affected vehicle projection coherent using existing repository transaction/executor/targeted-read/lock facilities where required; preserve original IDs/foreign references and legitimate record transitions. The current generic repository Promise.all writes may commit independently: do not assume one rejected Promise rolled all successful SQL back, or a SQL COMMIT throw proves no commit. Reconcile ambiguous outcomes and retries from existing canonical IDs/current rows rather than publish a guessed success, duplicate a new contract/policy or overwrite a concurrently committed lawful transition. Scope new awaited/throwing facades to these seven commands, leaving other Registry writers and the legacy global detached persistence behavior untouched outside authorized hunks.

Evidence: Actual transaction/client SQL assertions, coupled vehicle/source failure, same-ID retry, all seven applied-COMMIT/ACK-loss readbacks, unavailable readback with original ID, older-approval/newer-rejection serialization, identical-state write rejection and BEGIN/rollback/release/known-COMMIT rejection cases. `preservation-fixed.json` proves original repository members unchanged; new transaction methods are command-local.

### Original clause 3

Exercise actual approved/rejected/pending exclusivity and insurance/contract renewal paths with a healthy real driver/vehicle supply pairing whose other original conditions pass. A delayed/rejected approval or renewal must not temporarily permit dispatch from uncommitted cache; a rejected rejection must not claim canonical revoke completed. Trace real getVehicleDispatchability/getEligibleCandidates and existing production readiness consumers with controlled canonical rows, after success, on rejection and after service/repository reconstruction. Cover rejected-then-successful retry and coherent coupled-row/commit failure without creating a new global PG/multi-instance/native/provider gate or running PG/HTTP servers on this VM.

Evidence: Actual healthy driver/vehicle checks call `getVehicleDispatchability`, `getEligibleCandidates`, `getDriverAvailability` and `VehicleEligibilityService.assertDispatchAssignmentEligible`. Contract/policy pending, delayed/rejected renewal, retry and real `onModuleInit` fresh reconstruction are exercised with controlled canonical rows.

### Original clause 4

Preserve original expired insurance/contract/driver licence rejection, missing-document block, one effective exclusivity declaration per vehicle and lawful replacement, pending/rejected exclusivity, manual holds, service product/driver/vehicle/tenant/auth guards and original no-DB controlled semantics. Do not invent new insurance/key/financial/provider/role, declaration-file-null or fee policy, eliminate valid records, delete user data or remove any required original predicate. C073 final-exit/debranding, Incident suppression, expiry backlog/renewal late receipts and T30/T7 reminders remain their original sole tasks; this task must integrate their completed current base rather than repeat or narrow them.

Evidence: The affected union retains original expiry, missing-document, exclusivity, supply, manual-hold, C073, Incident, P5, B4 and driver-master cases, plus Preexpiry20 and renewal-recovery5. Only external SQL/socket/provider boundaries are controlled. No financial, date, auth, declaration-file-null or eligibility policy changes.

### Original clause 5

The Platform Admin Fleet and SDK callers already await their requests and show error/reload; no UI, SDK, contracts, global auth or unrelated Source write is authorized. Adapt only actual necessary awaits/async/type boundaries in the seven enumerated existing direct-test files. Preserve the accepted SR-QA-SUPPLY eligibility positives/negatives and the original 19 Contract read-model plus12 Ops component-scope credit and then-current assertions. Add meaningful actual controller/service/repository composition regressions in own namespace, with only external DB/clock/transport doubled; do not mirror the decision algorithm, assert only constant strings or delete assertions to pass.

Evidence: The seven original direct-test files and the precisely coordinated C073 caller consume actual async commands; controlled fixtures gain real repository transaction/readback transport. All original expectation operands/chains and titles are preserved by AST comparison ignoring only necessary async/await. Original Contract19 and Ops12 are retained. UI/SDK files are unchanged; their existing awaited/error/reload path was independently read by Root.

### Original clause 6

After Root normal canonical assignment and actual shared writer serialization, the original assigned owner uses an isolated worktree and then-current immutable accepted base. Run appropriate affected unit/typecheck/lint, ordinary commit/push/handoff, required exact-candidate CI, independent same-candidate reviewer and protected normal merge; record real before/fixed-after commands/exits/base/candidate and limits in UAT plus all four nonempty own v1 keys. This readonly preparation performed none of those actions. No VM product/dev/preview/browser/E2E/HTTP/PG/Docker server, cloud/provider/IAM/Operator/workercontrol/release, Root WIP mutation or forced-history waiver. Source DONE is only this Source repair, not full C072/C134/live/full-goal acceptance.

Evidence: Author command records, raw results, exact file selection, type/lint, preservation, ordinary hooks and publication are in the source evidence directory. Final candidate review, own hosted CI, protected merge and four acceptance records belong to Root; local unit checks do not substitute for them.

## Four original acceptance keys

| Key                                                                 | Source/evidence mapping                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c072_actual_seven-command-canonical-ACK-and-error`                 | Seven awaited controller methods; staged builders; dedicated command transaction and original before/fixed cases.                                                           |
| `c072_committed-qualification-readback-and-safe-retry`              | Canonical vehicle/source snapshot; exact COMMIT uncertainty readback; healthy candidate/readiness and same-ID rejection/retry/fresh-instance cases.                         |
| `c072_original-expiry-exclusivity-documents-and-caller-regressions` | Original eight caller files, preserved assertions, Contract19/Ops12 and accepted dependency union.                                                                          |
| `c072_exact-candidate-validation`                                   | Immutable full handoff manifest/results, recorded direct exits, types/lint/hooks; Root independent exact-candidate review, own CI/protected merge and four own key records. |

## Evidence and limitations

Machine evidence is under `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/registry-commands-original-source-evidence/`. `full-source-handoff-results.json` and its manifest supply exact final counts, command exits, file hashes and candidate identity. Repeated/overlapping runs are not added.

Preparation diagnostics remain distinct: initial missing zod collected no tests; early new tests assumed nonexistent envelope fields/error message fields and an incorrect seeded declaration; fresh reconstruction comparison needed complete records sorted by ID. The first affected run was 131 PASS/4 FAIL from existing partial SQL fixtures. The initial 23-file run had 302 assertion PASS and one uncollected P5 mounted file due a missing tracked side-effect import. The following P5-only attempt failed because its dynamically loaded tracked component had not been materialized. These sparse setup failures are preserved and do not establish a product defect or pass. The initial API typecheck attempted a not-yet-created config and did not execute typechecking; the collected Source check is separately recorded.

Tests invoke real production decisions and repository SQL through explicitly simulated external database/client/clock boundaries. This is socketfree controlled-transport evidence, not an actual PostgreSQL engine, hosted HTTP/browser acceptance, mail delivery or live deployment. The Webhook file containing a real HTTP receiver was never executed on this VM. No product/dev/preview/HTTP/PG/browser/E2E/Docker server, provider/worker/account or cloud controls were used. New-candidate required CI and normal merge remain independently qualified by Root. This finite Source repair is not a claim of full C072/C134/live or whole-system completion.

Final author validation: `delivery-full-union` direct0, exact 23 files / 317 PASS / 0 FAIL / 0 SKIP / 0 Unhandled, including own43, original Contract19/Ops12, P5 mounted12 and Preexpiry20+R1five. Counts overlap earlier runs and are not added. `delivery-api-source-typecheck`, `delivery-affected-tests-typecheck` and `delivery-eslint` direct0. Initial lint found one unused observation parameter in this round's fixture; it was consumed without changing assertions or transport decisions. The initial preservation checker included enclosing test bodies; the corrected assertion-only AST comparison preserves all 495 original expectation statements and every title.

Read-boundary correction: one preliminary `sed` command inadvertently ran in R and read lines1926–1946 of the main-tree Registry repository rather than W. That fragment was not copied, staged, written or used as implementation authority; the intended signature was subsequently read from the correct W/c05. It is recorded in the packet as an author operation error, not a claim of zero main-tree product reads. No Root Source was written and no Voice foreign files were read.
