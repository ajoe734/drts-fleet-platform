# AUDIT-PROOF-CLOSURE-20261002 — payment proof implementation evidence

## Status and provenance

Owner: Pi. Independent reviewer: Codex. This is **implementation and offline regression evidence**, not a cloud-storage, antivirus-engine, browser, or financial-provider live acceptance.

- Audit findings addressed: F01 (legacy payment bypass), F02 (no proof-byte reader), proof-specific F03 (process-local storage / unprovisioned scanner wiring).
- Source baseline: `2b4b6b96aed1c41ae4b252681e0466ee808cbd0e` (origin/dev at task start).
- Implementation anchors: `3914a177e` and `303a9fb0ed2fc9360781849f5e6c36bc81ade5ca`. The latter is the tested code revision. Subsequent evidence-only commits do not change the tested implementation; the handoff and CI must identify the immutable final candidate.
- Environment: Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4, TypeScript 5.9.3. Tests explicitly set NODE_ENV=test, unset DATABASE_URL/API_DATABASE_URL, and use an offline-only signer secret. No credentials or provider endpoints were exercised.
- Source checkout and dependency installation are private to the task. No reset/stash of the canonical dirty tree, product/browser server startup, database/Compose infrastructure startup, deployment, real payment, or real malware-engine operation was performed. The focused checks do not use a database. An overly broad unit selection exposed an existing DB-dependent test and was stopped as described below.

Machine-only logs are under .local/project-fixes-20261002/ (not tracked deliverables). They include proof-before-fix-gates.log, proof-all-tests.log, proof-typecheck.log, proof-client-typecheck.log, proof-admin-typecheck.log, proof-unit-typecheck.log and proof-lint.log. The committed tests below are the reproducible evidence, rather than an assertion that another machine can retrieve these local logs.

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

Full repository unit results and final-candidate hosted review/CI are recorded separately when available; the focused result above does not assert that all repository checks or hosted acceptance passed.

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
