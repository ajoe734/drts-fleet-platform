# AUDIT-PROOF-CLOSURE-20261002 — payment proof implementation evidence

## Status and provenance

Owner: Pi. Independent reviewer: Codex. This is **implementation and offline regression evidence**, not a cloud-storage, antivirus-engine, browser, or financial-provider live acceptance.

- Audit findings addressed: F01 (legacy payment bypass), F02 (no proof-byte reader), proof-specific F03 (process-local storage / unprovisioned scanner wiring).
- Source baseline: `2b4b6b96aed1c41ae4b252681e0466ee808cbd0e` (origin/dev at task start).
- Implementation anchors: `3914a177e` and `303a9fb0ed2fc9360781849f5e6c36bc81ade5ca`. The latter is the tested code revision. Subsequent evidence-only commits do not change the tested implementation; the handoff and CI must identify the immutable final candidate.
- Environment: Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4, TypeScript 5.9.3. Tests explicitly set NODE_ENV=test, unset DATABASE_URL/API_DATABASE_URL, and use an offline-only signer secret. No credentials or provider endpoints were exercised.
- Source checkout and dependency installation are private to the task. No reset/stash of the canonical dirty tree, product/browser server startup, database/Compose infrastructure startup, deployment, real payment, or real malware-engine operation was performed. The focused checks do not use a database. An overly broad unit selection exposed an existing DB-dependent test and was stopped as described below.

Machine-only logs are under .local/project-fixes-20261002/ (not tracked deliverables). They include proof-before-fix-gates.log, proof-all-tests.log, proof-typecheck.log, proof-client-typecheck.log, proof-admin-typecheck.log, proof-unit-typecheck.log and proof-lint.log. The committed tests below are the reproducible evidence, rather than an assertion that another machine can retrieve these local logs.

## Commit-policy repair / successor provenance

The initial pushed candidate `3c452840a251cb3f0a49c93785cdb91bc528a7c4` (PR #2284) failed the Commit trailers gate because four commit subjects used a lowercase billing scope instead of the required task-ID prefix. This was an owner delivery-metadata mistake, not a missing product test assertion. Running `python3 tools/ci/git/check_commit_trailers.py` on the full baseline-to-candidate range reproduced it. The other immediately visible failed aggregate runs were canceled predecessor checks, not proof of a product regression.

The owner explicitly reopened the task. No published commit was amended, rebased or force-pushed, and the check was not bypassed. An append-only successor branch, pi/audit-remediate-core-20261002-v2, was created from the same baseline with the complete original candidate diff. Before adding this note, its staged tree and the original candidate tree were **identical**: `16e792bd7e582e24bac8ecd5bd61b52f45a3582c`. Product/test blobs remain unchanged; this note is the only file-content delta. The original branch remains available as provenance. The successor has a correctly task-prefixed commit, a fresh immutable handoff and fresh same-SHA review/CI; the old failed candidate is not certified retroactively.

## Hosted CI follow-up (2026-10-03)

PR #2285 candidate `32213f32b64e3be4468864056422119ddb45f309` failed hosted root typechecking in run `37084130046` (Product smoke acceptance), with the same typecheck gate failing in integration run `37084130028`. The earlier standalone test check did **not** establish compatibility with the repository's full strict configuration: `exactOptionalPropertyTypes` rejected explicit undefined optional values in the API-client config and S3 test double, and indexed array inference allowed an undefined response Content-Type. These were test typing defects, not evidence of a hosted database or provider outage.

The follow-up omits absent optional properties and preserves response cases as readonly tuples. It does not weaken tsconfig, remove assertions, or skip gates. Revalidation in an isolated checkout: repository `pnpm run typecheck:root` exit 0; the seven-file focused command below passes 89/89, zero skips; ESLint on both corrected files and `git diff --check` exit 0. Machine-specific logs are under `.local/proof-ci-evidence/`. Fresh same-SHA hosted CI and independent review remain required; this local result does not certify smoke, deployment, or real-service acceptance.

### Independent review R1–R3 follow-up

The independent review of `32213f32b64e3be4468864056422119ddb45f309` returned three findings. The interactive user-requested continuation preserves that review and published history; the final handoff binds the new immutable SHA.

| Review finding | Repair and regression evidence | Remaining boundary |
| --- | --- | --- |
| R1: root TypeScript errors | Optional-property and tuple fixes above; actual root `pnpm run typecheck:root` passes. | New-head hosted CI required. |
| R2: driver creation inherited billing:write | `auth.policy.ts` now classifies only POST `reimbursements/proofs` and `reimbursements/proofs/staged-content` as driver:write / driver realm. `proof-route-auth.test.ts` invokes the real guard, real Reflector and actual controller metadata with only credential verification/identity mocked. Owning-batch upload and foreign-batch rejection remain exercised by the original sr-proof-001 service regressions. Missing scope/foreign realm and adjacent finance routes remain denied. | External credential/session issuance and deployed HTTP path are not certified by these boundary doubles. |
| R3: middleware rejected bearer download grants | `internal-key.middleware.ts` admits only GET of the exact remittance-proof download route with the generated UUID-shaped proof ID. No broad prefix, internal-key exception registry entry, upload/issuance exemption or cloud ingress change. The existing controller still verifies signed grant, expiry, clean scan and content integrity. `proof-download-auth.test.ts` exercises real middleware → guard → controller: valid exact bytes with/without configured internal key; forged/missing/expired grants denied before storage read; pending content denied; alternate methods/kinds/child and encoded paths denied. Proxy-header requests still require a valid grant. | This is application-layer bearer-grant access, not anonymous Cloud Run/IAP ingress. Proxy credential exchange and deployed browser acceptance remain hosted gates. |

The R2/R3 repair necessarily touches the two named shared auth files, beyond the original billing-only worker scope; this is explicitly disclosed in the handoff for supervisor/reviewer scope reconciliation. No other auth policy or cloud configuration was changed.

Completed local follow-up: root typecheck exit 0; ESLint on both shared auth files and new tests exit 0; the seven-file focused command below plus `tests/unit/internal-key.middleware.test.ts` and `tests/unit/bootstrap-auth-guard-strict-env.test.ts` now selects **11 files / 120 tests, all passed, zero skips** (the two new tests reside under the already-selected sr-proof-001 directory). Machine logs: `.local/proof-ci-evidence/auth-{typecheck,lint,tests}.log`. Initial new-test setup attempts exposed a root-package dependency-resolution issue and an unsupported clean→rejected test transition; the final tests resolve Nest from the API workspace and construct pending content directly. These failed development iterations are not passing evidence. No product/network/browser/DB/Compose runtime was started.

## Finding-level repair and regressions

| Finding | Previous behavior | Repair | Committed regression / limitation |
| --- | --- | --- | --- |
| F01 legacy bypass | Approved batches could be marked paid with an invented, unscanned, rejected or foreign-batch proof ID. | Compatibility service delegates to the same proof-backed gate; controller explicitly requires the same realm/scope as the new route and passes its idempotency key and identity. | `tests/unit/system-remediation/sr-proof-001/legacy-proof-gate.test.ts`: both routes, negative matrix, no batch/statement mutation on failure. |
| F01 idempotency/state | A paid batch could return success for a substituted proof; alternate intent keys could mint additional receipts; a failed DB write could leave local state paid. | Immutable batch receipt, proof/driver/amount replay checks, batch-level SQL advisory transaction lock, publish local state only after persistence. | Same test file checks old/new convergence and persistence failure/retry. `tests/unit/audit-proof-closure.test.ts` checks repository lock-before-read SQL at the database boundary; **not** a real PostgreSQL concurrency test. |
| F02 grant without bytes | Grant kind was unsupported by generated-document store; issuance alone did not serve a file. Fixed signer defaults also overrode configured key IDs. | Dedicated signed byte-serving controller, runtime key selection, strict signature/version/window validation, current clean-scan + hash/size/MIME validation before bytes. | `tests/unit/audit-proof-closure.test.ts`: controller registration, byte identity, rotated key, forged/incomplete/expired/future/overlong grant denial, pending-content denial, missing/mutated storage. No HTTP server was started. |
| F02 operator path | UI displayed an authorized banner but never fetched the original; before payment it looked only at the post-payment proof foreign reference. | Authoritative batch proof lookup, BFF-aware binary API-client fetch, actual Blob download, explicit scan retry. Paid batches keep their recorded payment proof. | `tests/unit/audit-proof-client.test.ts`: real API-client code, configured API/BFF paths, preserved query, unsafe-origin/path denial, file/error distinction. Platform-admin typecheck passes; browser interaction remains hosted acceptance. |
| F03 storage | Runtime module always injected an in-memory map. | Explicit S3 provider and durable metadata requirement; missing configuration fails closed, memory is test-only. Conditional creates arbitrate staged reference consumption across instances. | `tests/unit/audit-proof-closure.test.ts`: separate adapter instances share an external SDK-boundary double; exact bytes, concurrent single-use commit, expiry, tampering, namespace and MIME checks. This is **not** a real S3/Cloud Run restart test. |
| F03 scanner | Only an unprovisioned adapter was wired; no transport could perform a real scan. | Configured clamd INSTREAM over bounded TCP/verified TLS, actual persisted bytes checked against identity, no EICAR-only runtime option. HTTP upload attempts scanning; outage retains the committed pending proof and authorized retry is available. | Same test file: protocol frames, definitive clean/infected verdicts, malformed/error responses, socket timeout/close/size failures, verified TLS settings, pending/retry lifecycle. Network and engine are external-boundary doubles. |

### Before/after reproduction

A `git archive` of the immutable baseline was expanded into a separate machine-local directory; only the new legacy gate test was overlaid. No active worktree was reset.

The filtered baseline run (`-t 'payment proof gate'`) exited 1: **5 failed, 5 passed, 3 intentionally unselected**. Four failures demonstrate the old compatibility route returning paid for fabricated / pending / rejected / cross-batch proof. The fifth is the old proof-backed blank-ID error contract (NOT_FOUND instead of the now-explicit validation error); it is not another successful payment bypass. The baseline already rejected a missing ID through the legacy route; that behavior is not falsely claimed as a new repair.

The initial unfiltered baseline probe also exposed an unhandled old fire-and-forget persistence rejection and synchronous-return mismatches against the new async assertions. It is preserved as diagnostic context in proof-before-fix.log, not mixed into the filtered bypass reproduction.

The repaired focused run passed **89/89 across seven files**, zero skips, exit 0:

```bash
NODE_ENV=test env -u DATABASE_URL -u API_DATABASE_URL \
  CONTROLLED_DOWNLOAD_SIGNING_SECRET=offline-unit-test-proof-secret \
  pnpm exec vitest run \
  tests/unit/audit-proof-client.test.ts \
  tests/unit/audit-proof-closure.test.ts \
  tests/unit/system-remediation/sr-proof-001/ \
  tests/unit/billing-settlement.test.ts \
  tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts \
  tests/integration/conf-idem-005-client-intent.integration.test.ts --maxWorkers=1
```

The client-intent integration file is controller/service integration without listening sockets or a database. Its existing repeat-intent assertions now additionally verify that the compatibility controller forwards the same key into the shared proof gate.

Other completed checks (all exit 0):

- API: `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`.
- API client: `pnpm exec tsc -p packages/api-client/tsconfig.typecheck.json --noEmit`.
- Platform admin: `pnpm exec tsc -p apps/platform-admin-web/tsconfig.json --noEmit`.
- Strict standalone TypeScript check of the three newly added unit files with ES2022, ESNext/Bundler resolution, decorators/metadata and skipLibCheck.
- ESLint with max-warnings=0 over the billing module, changed API-client/UI sources, new tests and updated legacy/finance/idempotency tests.

The broader `tests/unit` run with only db-apply.test.ts excluded completed on the same implementation tree: **365 files passed, 3 files skipped, 3981 tests passed, 43 tests skipped**. Overall exit **1**, not green: the following three unchanged suites explicitly fail their suite setup without an isolated real PostgreSQL URL (22 of the skipped tests belong to these failed suite setups):

- `tests/unit/system-remediation/sr-qa-concurrency-001/dispatch-reservation-concurrency.test.ts`
- `tests/unit/system-remediation/sr-qa-concurrency-001/idempotency-concurrency.test.ts`
- `tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts`

These concrete VM/resource blockers are preserved, not suppressed or labeled passing. All executed test assertions passed; the three required SQL suite setups did not. The machine-only result is proof-repository-unit.log (239.19 seconds, exit 1). A map unit test regenerated two provenance fields in a historical tracked fixture; that generated output was preserved machine-locally and only this task-created fixture diff was restored, rather than committing synthetic evidence as a new live closeout. Final-candidate hosted review/CI remains required; neither the focused result nor this broader run asserts every repository/live gate passed.

**Local check-scope correction:** the first broad `vitest run tests/unit` was stopped (exit 143) after its worker was observed invoking the existing `tests/unit/db-apply.test.ts`. Despite its directory, that file unconditionally uses psql / Docker Compose exec and creates synthetic databases on an existing container; unsetting DATABASE_URL does not disable it. Its subprocesses were terminated, not treated as a passed unit check. No server/container was started and no existing database/volume was removed as cleanup. The task did not subsequently query or manipulate the existing database. This run must not be cited as proof that no DB operation was attempted or that the DB gate passed. Owners of other broad checks were notified. The corrected local selection explicitly excludes this file; real migration/concurrency acceptance belongs in hosted CI. No committed test or hosted CI gate was disabled. Early local setup failures (shared dependency symlinks; inherited NODE_ENV=production) were resolved by a private frozen offline install and explicit test environment, not by changing production guards.

## Runtime contract and configuration

### Existing payment routes

- POST `/api/reimbursements/:batchId/pay`: retains the reimbursement-batch response shape. Idempotency-Key is required; a real remittanceProofId is required. There is no bare-ID fallback, including for direct service callers.
- POST `/api/reimbursements/:batchId/pay-with-proof`: retains the receipt response and body idempotency key. Both routes require system/platform/ops realm plus billing:write and the same batch approval / proof / clean-scan gate.
- A different proof, driver or amount cannot replay an existing receipt. A different intent key for the same batch/proof returns the first receipt, not a second payment. This records reimbursement payment state; it does not initiate a bank transfer.
- Existing historically paid batches with nonexistent or invalid proof references are **not** automatically rewritten or certified. Operators must reconcile those records; inventing a retrospective clean proof would defeat the gate.

### Proof lookup, scan and download

- GET `/api/reimbursements/:batchId/proof`: authorized billing reader; latest uploaded proof before payment, recorded payment proof afterward. It does not set paid state merely to make the UI discover an upload.
- POST `/api/reimbursements/proofs/:proofId/scan`: authorized billing writer; invokes the configured scanner, accepts no caller-supplied verdict. Unavailable/no definitive result returns 503; clean/rejected terminal scans are idempotent.
- POST `/api/reimbursements/proofs` attempts the same scan after a committed upload. Scanner failure preserves pending_scan and the upload ID; retry scan rather than resubmitting a consumed staged reference.
- Readback issuance remains an authorized, actor-attributed audit event. The bearer GET is `/api/reimbursements/proof-downloads/remittance-proof/:proofId`; the grant itself authorizes this request. The UI goes through its configured API/control-plane proxy, not a relative link on the console origin.
- Signature version 1, runtime CONTROLLED_DOWNLOAD_KEY_ID / CONTROLLED_DOWNLOAD_SIGNING_SECRET, fixed 15-minute maximum window, no future issue time, signature before record lookup. No signer secret is embedded in code.
- Only clean proofs can serve bytes. A grant alone is not a malware exemption. Stored bytes, hash, length and MIME must still match the proof record and signed hash.
- Response: attachment, no-store, nosniff, no-referrer. User-controlled filenames are not emitted as HTTP headers. The console downloads a local Blob, rather than navigating to uploaded active content.

### Durable object storage

Set REMITTANCE_PROOF_STORAGE_PROVIDER=s3 and:

- REMITTANCE_PROOF_S3_BUCKET and REMITTANCE_PROOF_S3_REGION (required).
- REMITTANCE_PROOF_S3_ENDPOINT (optional, HTTPS only, no embedded credentials/query/fragment).
- REMITTANCE_PROOF_S3_FORCE_PATH_STYLE (optional true/false).
- REMITTANCE_PROOF_S3_ACCESS_KEY_ID / REMITTANCE_PROOF_S3_SECRET_ACCESS_KEY as a pair, optional REMITTANCE_PROOF_S3_SESSION_TOKEN; otherwise the SDK's workload credential chain. Use managed secrets, never checked-in keys.
- Durable database metadata is mandatory outside tests, including the existing V0098 proof/receipt tables. Object storage alone cannot make process-local metadata durable.

The private bucket namespace has staged, consumed and content prefixes under remittance-proof. Stages expire after 15 minutes. Retain consumed markers at least as long as stages; apply operator-owned lifecycle cleanup for expired stages/markers. Content objects require the financial retention policy, private access, encryption and backup/restore controls. The adapter never requests public ACLs.

Maximum stored/inspected content is 10 MiB, PDF/PNG/JPEG/WebP; length and SHA-256 are computed from actual bytes. The existing base64 HTTP staging route is also subject to the deployment's JSON body-size limit, which can be lower than the storage ceiling. This change does not globally enlarge unrelated API request limits.

**Backend requirement:** conditional PutObject with If-None-Match `*` must be enforced. Unsupported S3-compatible backends are not certified by the unit double; independently verify conditional-create races before enabling. In particular, do not assume a GCS XML endpoint is interchangeable with S3 without testing its conditional-write semantics.

### Antivirus transport

Set REMITTANCE_PROOF_SCANNER_PROVIDER=clamd and:

- REMITTANCE_PROOF_CLAMD_HOST (required), REMITTANCE_PROOF_CLAMD_PORT (default 3310).
- REMITTANCE_PROOF_CLAMD_TLS (default true): use a private, certificate-verified TLS tunnel/endpoint. Native clamd itself does not supply TLS authentication; false is an explicit private-network operator choice, not permission for public exposure.
- REMITTANCE_PROOF_CLAMD_TIMEOUT_MS (default 15000; 100–60000).

Only the documented INSTREAM protocol is used. Stream length framing, maximum object/reply size and overall timeout are bounded. Exactly `stream: OK` clears a proof; a definitive FOUND result rejects it. ERROR, truncation, timeout, malformed response or mismatched stored bytes leave pending_scan and block payment/download. Provision engine signature updates, private network access, TLS trust and monitoring; this code does not attest that a remote engine is current merely because configuration exists.

No in-memory storage or EICAR-signature-only scanner is selectable as a production fallback. Provider availability here indicates configured capability, not a successful cloud/engine health probe. Missing storage refuses operations; missing scanner never fabricates clean.

## Acceptance mapping and remaining gates

| Task acceptance | Evidence / disposition |
| --- | --- |
| legacy_and_new_pay_share_proof_gate | Implemented; before/after service regressions, RBAC metadata parity and controller intent forwarding pass. |
| real_byte_readback_and_authorization | Implemented; actual controller StreamableFile bytes, negative grants/content tests and API/BFF client tests pass. Hosted browser/IAP/auth path still needs same-candidate acceptance. |
| configured_durable_storage_and_scanner | Implemented real S3 SDK and clamd transport wiring; external-boundary tests pass. No live bucket/engine/DB evidence claimed. |
| same_sha_review_ci | Required on final candidate; independent review and hosted CI are not owner-self-approved by this document. |

Before claiming production readiness, obtain same-candidate evidence for real object-store conditional writes, two-instance/process restart readback, durable DB concurrency, private scanner clean/infected/error behavior, signed URLs through the deployed API/BFF/IAP, allowed/denied identities and step-up policy, and actual operator browser download. Existing SR-LIVE-DOC-001 and finance/storage/signing gates remain open until this evidence exists. Shared generated-document artifact durability is a separate dependent task; this proof controller does not pretend to fix all generated artifact kinds.

## Second R3 reopen: persisted UUID admission (2026-10-03)

Codex independently reopened candidate `587b4451f17a83db104abb8749689040e7e8f863` (generation `6986acfa3c4d449f96480c57fe7ae242`, PR #2285). R1 root TypeScript and R2 actual driver guard authorization were verified repaired; R3 remained wrong for every durable proof. V0098 defines `proof_id uuid DEFAULT gen_random_uuid()`. The real `BillingSettlementRepository.insertRemittanceProof` returns this raw UUID through its actual mapper. Only the test-memory service path adds `remit-proof-`. The first middleware repair admitted only that test identity; the prior positive fixture therefore concealed the production mismatch. Reviewer's offline production-function probe successfully served a raw-UUID signed URL from the actual controller but the same URL failed middleware with 503 `INTERNAL_KEY_NOT_CONFIGURED` / 401 `INTERNAL_KEY_REQUIRED`. Authenticated BFF admission was not the failing path. This is a repeated R3 finding, not a new feature or a reason to reopen R1/R2.

The interactive coordinator reconciled the canonical write scopes for the already disclosed `auth.policy.ts` and `internal-key.middleware.ts` before this repair. Scope remains the existing user-authorized proof closure; no broader public route registry, DB identity change or cloud ingress relaxation is introduced.

### Reproduction and focused correction

`proof-download-auth.test.ts` now runs the complete matrix against both the test-memory service and the **actual durable repository**. Only database I/O is doubled: a strict SQL boundary accepts insert/select/scan-update against the V0098 table, returns a schema-shaped raw-UUID row, verifies insert never supplies `proof_id`, and leaves row mapping to production code. Real staged/committed bytes remain in the storage-boundary test adapter. Service upload, scan update/read, signer, middleware, actual BootstrapAuthGuard metadata, controller and StreamableFile are not replaced. The controller gets the ID extracted from the tested URL, not an unrelated fixture ID.

Before changing production code, this stronger suite on `587b4451` produced **9 failed / 13 passed**; raw-UUID requests were rejected at middleware instead of reaching their expected grant/content checks. Preserved local evidence: `.local/proof-ci-evidence/raw-uuid-before.log`. The successor changes only the exact GET matcher to accept a raw UUID or the existing test-memory prefix. Other methods, kinds, children, trailing slash and encoded-path tricks remain outside this admission; downstream signature/expiry/scan/content verification is unchanged.

After repair: **22/22** download authorization cases pass. Positives read identical bytes with and without a configured internal key, without requiring its header. Negatives cover forged/missing/expired grants before storage access, a different URL identity, pending scan, hash/length/MIME mismatch and missing objects. The authenticated BFF header cannot turn an invalid grant into access. A `net.Server.listen` prohibition guard prevents this suite from starting a listener.

Completed source verification: **11 files / 136 tests passed, zero skips** (119 proof/client/payment cases plus 17 strict-auth/internal-key cases), root TypeScript and changed-file lint passed, internal-key exception audit passed with no registry entries. Commands:

```sh
NODE_ENV=test env -u DATABASE_URL -u API_DATABASE_URL pnpm exec vitest run \
  tests/unit/audit-proof-client.test.ts tests/unit/audit-proof-closure.test.ts \
  tests/unit/system-remediation/sr-proof-001/ tests/unit/billing-settlement.test.ts \
  tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts \
  tests/integration/conf-idem-005-client-intent.integration.test.ts --maxWorkers=1
NODE_ENV=test env -u DATABASE_URL -u API_DATABASE_URL pnpm exec vitest run \
  tests/unit/internal-key.middleware.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts --maxWorkers=1
pnpm run typecheck:root
pnpm exec eslint apps/api/src/common/auth/internal-key.middleware.ts tests/unit/system-remediation/sr-proof-001/proof-download-auth.test.ts
python3 operations/security/verify-internal-key-exceptions.py
```

Logs: `.local/proof-ci-evidence/raw-uuid-{after-tests,auth-tests,typecheck,lint}.log`. Source checks do not establish real PostgreSQL/schema execution, object-store durability, antivirus service readiness, cloud ingress/browser acceptance or deployment. Independent review and hosted CI must bind the exact append-only successor SHA recorded in the canonical handoff; earlier CI does not certify it. All external gates above remain open.
