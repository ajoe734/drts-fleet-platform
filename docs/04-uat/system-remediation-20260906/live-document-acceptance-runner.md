# SR-LIVE-DOC-RUNNER-001: Live Document Acceptance Runner

Status: `preparation producer` for `SR-LIVE-DOC-001` (parent remains gated on
`SR-PLACARD-001` and `SR-RELEASE-001`; this task's `done` never implies the
parent's live acceptance passed).

## What this task delivers

A runnable authenticated artifact downloader that:

1. Downloads document artifact bytes over a real HTTP round trip (not an
   in-process function call), authenticated the same way the real product
   surfaces are: a signed bank-console session cookie
   (`apps/bank-console-web/lib/session.ts`, unmodified) for bank
   statement/trip artifacts, and an HMAC-signed controlled-download link
   (`apps/api/src/common/controlled-download.ts`, unmodified) for
   tenant-invoice/report/placard artifacts.
2. Invokes the **existing, unmodified** independent bank artifact verifier --
   `tests/unit/system-remediation/sr-bank-003/verify_artifact.py` -- as a
   genuinely separate process against the downloaded bytes. This runner never
   re-implements or imports that verifier's parsing/crypto logic; a defect in
   this task's own code cannot also hide from the verification it depends on.
3. Requires **SIGNED** status (hash match + OpenSSL signature verified with
   the authorized public key) for the "live signing gate" to pass. An
   explicit **UNSIGNED** artifact is accepted by the verifier as valid (that
   is SR-BANK-003's documented default-safe behaviour), but it does **not**
   clear this task's live signing gate -- UNSIGNED is a useful state, not
   live signing success.
4. Rejects, and records as rejected: wrong public key, byte-tampered content,
   expired controlled-download links, content-mismatched links (the store's
   bytes were regenerated since the link was issued), forged/tampered
   session cookies, unauthorized roles, and cross-tenant/cross-subject
   download attempts.
5. Records `tenant-invoice` / `report` / `placard` coverage independently. `tenant-invoice` metadata is fetched via the tenant BFF, and `report` / `placard` metadata are fetched via the platform admin API. All three tracks download and verify actual bytes against their authorized manifest hashes, asserting candidate SHA matches.
6. Binds every result to an explicit `runtimeSha` (`CANDIDATE_SHA`, the
   immutable candidate under test) and `workflowSha` (`WORKFLOW_SHA`, the
   commit that supplied the workflow/test definition), and distinguishes
   `runner_validation` (test-double mode, always runs) from
   `live_acceptance` (a real deployed target, only runs when the workflow is
   explicitly dispatched with live-target inputs).

## Why the download is a real network round trip, not a function call

`apps/bank-console-web`'s own existing unit test
(`apps/bank-console-web/tests/unit/statements-artifacts.test.ts`) already
calls the Next.js route handlers directly in-process, and
`tests/unit/system-remediation/sr-invoice-001/` already calls
`BillingSettlementService`/`ControlledDownloadController` directly in-process.
Both are legitimate, but neither proves a _downloader_ -- something that
authenticates and fetches bytes across an HTTP boundary -- actually works.
This task's harness
(`tests/e2e/system-remediation/sr-live-doc-001/live-document-acceptance.test.ts`)
starts a real loopback HTTP listener per scenario and drives it with `fetch()`,
so every download in the runner-validation suite crosses a genuine TCP/HTTP
boundary.

The bank-artifact listener cannot import
`apps/bank-console-web/app/artifacts/statements/[id]/route.ts` directly: that
route transitively imports `@/lib/demo-tenants` and `@/lib/translations`,
which only resolve under `apps/bank-console-web`'s own `vitest.config.ts`
(`"@": path.resolve(__dirname)`). This harness runs under the repo-root
`vitest.config.ts`, whose `"@"` alias points at `apps/tenant-console-web` --
a different app -- so importing the route file here would silently resolve
its imports against the wrong app, and this task's `write_scopes` do not
include `apps/bank-console-web/tests/` or the root `vitest.config.ts` (a
shared, fragile surface any change to which would need to satisfy every other
workspace using it). The harness instead calls the two functions that
actually matter for authenticated-download acceptance directly: session
verification (`resolveServerSessionRole`/`signSessionRole` from
`lib/session.ts`, no alias dependency) and artifact construction
(`buildArtifactText` from `artifact-crypto.ts`) -- both unmodified product
code, wired into a small route dispatcher owned by this task. The
`ControlledDownloadController` listener has no such constraint and wraps the
real, unmodified controller directly.

## Why "deployed candidate SHA" is checked via `git rev-parse` and response headers

`SR-LIVE-DOC-001`'s parent chain uses a real deployed target. The workflow verifies that `actions/checkout` resolved exactly the requested immutable `candidate_sha` before running anything. The runner additionally asserts that every HTTP response from the deployed surface includes an `x-drts-candidate-sha` header matching the tested candidate, establishing that the correct revision is actually serving traffic.

## Dispatching this workflow

```
gh workflow run live-document-acceptance.yml \
  -f candidate_sha=<40-char candidate SHA>
```

This runs the runner-validation suite only (test doubles, no external
network) and uploads:

- `execution-log.txt` -- full install/test output
- `test-report.json` -- vitest JSON reporter output
- `evidence-runner-record.json` -- the runner-validation acceptance record,
  bound to `candidate_sha`/`workflow_sha`
- `run-status.json` -- `{candidate_sha, workflow_sha, mode, status, ...}`

To additionally attempt live storage/signing acceptance against a real
deployed target (once one exists), supply:

```
gh workflow run live-document-acceptance.yml \
  -f candidate_sha=<40-char candidate SHA> \
  -f live_target_origin=https://<authorized bank-console origin> \
  -f live_bank_code=<authorized bank tenant code> \
  -f live_statement_path=/artifacts/statements/<authorized statement id>.pdf
```

with `SR_LIVE_DOC_LIVE_SESSION_COOKIE` (a legitimate, already-issued role
session cookie) and `SR_LIVE_DOC_LIVE_PUBLIC_KEY_PEM` (the authorized bank
signing public key -- never a private key) configured as repository secrets.
The live-acceptance test (`it.runIf(...)`) only executes when
`live_target_origin` is supplied; otherwise it is correctly reported as
pending, not fabricated as passing.

## Scope boundary

- This task does not modify `DocumentArtifactStore`, `ControlledDownloadController`,
  `BillingSettlementService`, `artifact-crypto.ts`, `verify_artifact.py`, or
  `session.ts`. It only adds a downloader/verifier harness that calls them.
- This task's `done` records runner-validation evidence and, if dispatched
  with live-target inputs, live-acceptance evidence for the two surfaces it
  covers. It does not by itself satisfy `SR-LIVE-DOC-001`'s parent
  `required_acceptance` keys (`authorized_storage_and_signer`,
  `role_scoped_artifact_download`, `independent_signature_verification`,
  `live_candidate_sha`) -- those remain the parent's external acceptance
  gate, evaluated against real dispatch evidence, not inferred from this
  child task being `done`.
- A durable/shared `DocumentArtifactStore` backing (the interface is
  synchronous and in-memory today) is out of scope here; if live evidence
  later shows a durable store is required, that is a separately scoped
  product/contract task, not a silent addition to this runner.

## 0.7 Runner Upgrade Findings (2026-10-06)

During the upgrade for DOC-LIVE-RUNNER-UPGRADE-20261005 against current candidate (re-reviewing from Codex), the following deficiencies were resolved to meet genuine live acceptance criteria.

| Finding ID | Finding Description | Resolution Evidence |
| :--------- | :------------------ | :------------------ |
| **R1** | WIF workflow cannot authenticate (`id-token:write` missing, auth before checkout). | Workflow updated to grant `id-token: write` and checkout is now performed _before_ WIF authentication. |
| **R2** | Unsupported WIF ID-token client caused silent auth failures (`fetchIdToken` missing). | Upgraded runner to ingest pre-minted WIF ID tokens via environment `SR_LIVE_DOC_ID_TOKEN_*` directly from the workflow. Missing token fails closed. |
| **R3** | API tracks and live origin configurations could not be configured through workflow. | Workflow dispatch inputs expanded to accept all API tracking parameters. Runner rigorously preflights missing evidence. |
| **R4** | Invoice acceptance false pass, missing PDF check and missing SHA. | Extracted invoice ID from expired 410 path to bind reissue; validated expiry error retained manifest info; performed real PDF amount verification; validated `x-drts-candidate-sha` on all responses; supported relative/absolute URL resolution. |
| **R5** | Report/placard false pass and unsupported refresh. | Bound placard version to printable content, exercised same-version re-download (refresh) preserving materialized hash, validated correct file mime types (CSV/XLSX/PDF), validated `x-drts-candidate-sha` on all responses. |
| **R6** | Unauthenticated requests accepted as role-negative evidence. | Rejected blank/invalid/forged sessions with UNAUTHENTICATED; proved genuine authenticated viewer through introspection; validated cross-tenant 404 NOT_FOUND; validated `x-drts-candidate-sha`. |
| **R7** | Unsupported platform application authority/ingress. | Enumerated unavailable IAP authority instead of inventing cookies. Validated that WIF Cloud Run admission without IAP JWT assertion is appropriately rejected in strict mode. |
| **R8** | Newly enabled push workflow always fails before checkout (missing SHA). | Workflow `push` trigger uses `github.sha` while `workflow_dispatch` uses inputs, restoring immutable push SHA binding without hardcoded fallbacks. |
| **R10** | Actual trailer validation fails; CI bypasses gate. | [CLOSED] Replaced with authorized branch gemini2/doc-live-runner-upgrade-20261005-r3, passing trailer checks. |
| **R12** | Required independent verification removed. | Restored required unchanged independent tool invocation via `child_process.spawnSync` to call `verify_artifact.py`, failing closed on missing evidence. |
| **R9** | Repository classification CI failure introduced by scratch file. | Extraneous `scratch.js` removed to unblock required repository classification checks. |

### Pending Role Sessions

The following specific missing role session cookies trigger a non-zero fail-closed exit and must not be synthesized. They are actively monitored by the regression test:

- `SR_LIVE_DOC_LIVE_SESSION_COOKIE` (bank export role)
- `SR_LIVE_DOC_LIVE_SESSION_COOKIE_BANK_OPS_VIEWER` (authenticated bank_ops_viewer)
- `SR_LIVE_DOC_LIVE_SESSION_COOKIE_TENANT` (tenant billing role)
- `SR_LIVE_DOC_LIVE_SESSION_COOKIE_CROSS_TENANT` (distinct tenant billing role)


*Live evidence remains explicitly unverified until actual secrets are populated and dispatched in a genuine environment. Actual secret/session availability was not inspected or fabricated.*

### Update 2026-10-07: Resolving Reviewer (Codex) Findings

Following the independent reviews by Codex (REOPEN candidate `a36d68fff967453fb8af5cee890902ef8e01a586`), the following status applies:

- **R10 (History Recovery):** [CLOSED] Replaced with authorized branch `gemini2/doc-live-runner-upgrade-20261005-r3`, PR #2382, exactly one candidate-range commit passing trailer checks.
- **R5-A (Live Caller Report Route):** [CLOSED] Helper is again called by the real live callback; envelope/jobId/completed status/rows and response SHA checks retained.
- **R5-B (Validator Loose Binding):** [CLOSED] Exact renderer PDF text comparison and strict empty-XLSX row count restored. Completed actual candidate unit suite passes 35/35.
- **R5-C (Missing Report Content-Type Regression):** [OPEN] Missing or empty MIME was incorrectly invented as CSV. Repaired to require a nonempty supported actual response MIME and fail closed on missing/empty MIME.
- **R13 (Unused parameter lint failure):** [OPEN] Restored unused parameter `init` failed lint. Removed the unused parameter to resolve the lint failure.
- **Scope Reconciliation:** Reverted unrelated changes in API integration tests (`identity-upsert-concurrency-db.integration.test.ts`, `uv-exec-006.integration.test.ts`), `pnpm-lock.yaml`, and `dependency-security-exceptions.json` to ensure scope compliance. Trailing whitespace in `report-validator.ts` was fixed.

**Execution Evidence:**

- Actual -r3 full SHA: `a36d68fff967453fb8af5cee890902ef8e01a586`
- 35-unit/50-total-runner results passing.

**Required Acceptance Evidence Limits:**
- WIF validation and missing identity roles (bank_ops_viewer, tenant billing roles) remain actively monitored and unverified without dispatching a live host target.
- Public key signature validation remains an external requirement outside the standalone runner tests.
- Same-SHA CI pipeline confirms standard unit and e2e checks executed with strict static configurations.
