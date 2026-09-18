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
5. Records `tenant-invoice` / `report` / `placard` coverage independently.
   Only `tenant-invoice` has a real producer behind
   `DocumentArtifactStore` today; `report` is intentionally out of scope for
   this store (it is served separately through
   `GET /reports/{jobId}/artifact`) and `placard` remains incomplete pending
   `SR-PLACARD-001`. Neither is treated as a defect in this runner -- both
   are reported as accurately-scoped coverage gaps.
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
Both are legitimate, but neither proves a *downloader* -- something that
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

## Why "deployed candidate SHA" is checked via `git rev-parse`, not a live host

`SR-LIVE-DOC-001`'s parent chain is blocked on `SR-RELEASE-001`; there is no
persistent deployed environment for this preparation producer to query today,
and no route in the product exposes a "currently running SHA" today either
(confirmed by inspecting `apps/api/src/modules/foundation/foundation.controller.ts`,
the closest existing manifest endpoint, which reports module status, not a
runtime SHA, and requires a realm/scope this runner is not meant to hold). The
workflow instead verifies, the same way
`.github/workflows/tenant-binding-acceptance.yml` already does, that
`actions/checkout` resolved exactly the requested immutable `candidate_sha`
before running anything. Once a real deployed target and a SHA-reporting
endpoint exist, `verifyDeployedCandidateSha`-style logic can be added to the
live-acceptance block without touching the runner-validation suite.

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
